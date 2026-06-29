import JSZip from 'jszip'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { type Card, type Deck, newReviewState } from '../types/deck'
import { stripHtml } from './html'

/** Anki joins a note's field values with the 0x1F unit-separator character. */
const FIELD_SEPARATOR = '\x1f'

/** A user-facing import failure with an actionable message. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export interface ImportResult {
  deck: Deck
  /** Counts of things deliberately not imported in v1. */
  skipped: {
    /** Cloze notes skipped (not renderable in v1). */
    cloze: number
  }
}

// --- sql.js loading (browser) ---------------------------------------------

let sqlJsPromise: Promise<SqlJsStatic> | null = null

/**
 * Load sql.js, resolving its WASM from our own origin (bundled in public/).
 * No network / CDN — honors the "100% client-side" rule and the static export.
 */
export function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => `${import.meta.env.BASE_URL}${file}`,
    })
  }
  return sqlJsPromise
}

// --- public entry points ---------------------------------------------------

/** Browser entry: import an `.apkg` File the user picked. */
export async function importApkgFile(file: File): Promise<ImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const SQL = await getSqlJs()
  return importApkgArchive(bytes, file.name, SQL)
}

/**
 * Core importer (testable): unzip, locate the collection DB, parse it.
 * Takes an initialized sql.js so tests can supply their own WASM location.
 */
export async function importApkgArchive(
  bytes: Uint8Array,
  fileName: string,
  SQL: SqlJsStatic,
): Promise<ImportResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new ImportError(
      "That file isn't a valid .apkg archive. Export a deck from Anki and try again.",
    )
  }

  // Newer zstd-compressed format is out of scope for v1 — guide the re-export.
  if (zip.file('collection.anki21b')) {
    throw new ImportError(
      "This deck uses a newer Anki export format. In Anki's export dialog, check " +
        '"Support older Anki versions" and export again.',
    )
  }

  const dbEntry =
    zip.file('collection.anki21') ?? zip.file('collection.anki2')
  if (!dbEntry) {
    throw new ImportError(
      "This .apkg doesn't contain an Anki collection database. It may be corrupt or not a deck export.",
    )
  }

  const dbBytes = await dbEntry.async('uint8array')
  const deckName = deckNameFromFileName(fileName)
  return parseAnkiDatabase(dbBytes, deckName, SQL)
}

// --- collection parsing ----------------------------------------------------

interface Notetype {
  name: string
  /** Field names in template order. */
  fieldNames: string[]
}

function parseAnkiDatabase(
  dbBytes: Uint8Array,
  deckName: string,
  SQL: SqlJsStatic,
): ImportResult {
  const db = new SQL.Database(dbBytes)
  try {
    const notetypes = readNotetypes(db)

    const noteRows = queryAll(
      db,
      'SELECT id, guid, mid, flds, tags FROM notes',
    )
    const cardRows = queryAll(db, 'SELECT id, nid, ord FROM cards')

    if (cardRows.length === 0) {
      throw new ImportError('This deck contains no cards.')
    }

    const notesById = new Map<number, (typeof noteRows)[number]>()
    for (const n of noteRows) notesById.set(Number(n.id), n)

    const now = Date.now()
    const cards: Card[] = []
    let clozeSkipped = 0

    for (const cardRow of cardRows) {
      const note = notesById.get(Number(cardRow.nid))
      if (!note) continue

      const notetype = notetypes.get(Number(note.mid))
      const noteTypeName = notetype?.name ?? 'Unknown'
      const rawValues = String(note.flds).split(FIELD_SEPARATOR)

      // Skip cloze: by notetype name or by {{cN::...}} markup in any field.
      if (isCloze(noteTypeName, rawValues)) {
        clozeSkipped++
        continue
      }

      const fieldNames =
        notetype?.fieldNames ??
        rawValues.map((_, i) => `Field ${i + 1}`)

      const fields: Record<string, string> = {}
      rawValues.forEach((value, i) => {
        const name = fieldNames[i] ?? `Field ${i + 1}`
        fields[name] = stripHtml(value)
      })

      const front = fields[fieldNames[0]] ?? ''
      const back = fields[fieldNames[1]] ?? ''

      cards.push({
        id: `${note.guid}:${cardRow.ord}`,
        ankiNoteId: Number(note.id),
        noteType: noteTypeName,
        fields,
        front,
        back,
        tags: String(note.tags).trim().split(/\s+/).filter(Boolean),
        reviewState: newReviewState(now),
      })
    }

    if (cards.length === 0) {
      throw new ImportError(
        clozeSkipped > 0
          ? `All ${clozeSkipped} card(s) in this deck are cloze cards, which aren't supported in v1.`
          : 'No importable cards were found in this deck.',
      )
    }

    const deck: Deck = {
      id: deckName,
      name: deckName,
      importedAt: now,
      cards,
    }
    return { deck, skipped: { cloze: clozeSkipped } }
  } finally {
    db.close()
  }
}

/** Read notetype id -> { name, ordered field names } from the `col.models` JSON. */
function readNotetypes(db: Database): Map<number, Notetype> {
  const rows = queryAll(db, 'SELECT models FROM col LIMIT 1')
  if (rows.length === 0) {
    throw new ImportError(
      "This .apkg is missing its collection metadata and can't be read.",
    )
  }

  let models: Record<string, unknown>
  try {
    models = JSON.parse(String(rows[0].models))
  } catch {
    models = {}
  }

  const entries = Object.entries(models)
  // Empty models => newer protobuf/notetypes-table schema we don't parse in v1.
  if (entries.length === 0) {
    throw new ImportError(
      "This deck uses a newer Anki export format. In Anki's export dialog, check " +
        '"Support older Anki versions" and export again.',
    )
  }

  const map = new Map<number, Notetype>()
  for (const [mid, model] of entries) {
    const m = model as { name?: string; flds?: Array<{ name?: string; ord?: number }> }
    const flds = (m.flds ?? [])
      .slice()
      .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
      .map((f) => f.name ?? '')
    map.set(Number(mid), { name: m.name ?? 'Unknown', fieldNames: flds })
  }
  return map
}

// --- helpers ---------------------------------------------------------------

type Row = Record<string, unknown>

/** Run a query and return rows as plain objects keyed by column name. */
function queryAll(db: Database, sql: string): Row[] {
  const res = db.exec(sql)
  if (res.length === 0) return []
  const { columns, values } = res[0]
  return values.map((row) => {
    const obj: Row = {}
    columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

function isCloze(noteTypeName: string, values: string[]): boolean {
  if (noteTypeName.toLowerCase().includes('cloze')) return true
  return values.some((v) => /\{\{c\d+::/.test(v))
}

function deckNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.apkg$/i, '').replace(/\.colpkg$/i, '')
  return base.trim() || 'Imported deck'
}
