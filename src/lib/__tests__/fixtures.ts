import JSZip from 'jszip'
import type { SqlJsStatic } from 'sql.js'

/**
 * Build synthetic `.apkg` archives in-memory so the importer can be tested
 * end-to-end without shipping a real Anki deck. Mirrors the subset of the Anki
 * schema the importer actually reads (col.models, notes, cards).
 */

const SEP = '\x1f'

interface NoteSpec {
  guid: string
  mid: number
  fields: string[]
  tags?: string
}
interface CardSpec {
  id: number
  /** Links to a note by its guid (resolved to the note rowid internally). */
  noteGuid: string
  ord: number
  /** Anki scheduling (optional; defaults to a brand-new card). */
  sched?: Partial<{
    type: number
    queue: number
    due: number
    ivl: number
    reps: number
    lapses: number
    mod: number
  }>
}

/** Collection creation time (epoch seconds) used by the synthetic fixtures. */
export const FIXTURE_CRT = 1_600_000_000

async function zipApkg(
  entries: Record<string, Uint8Array | string>,
): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(entries)) zip.file(name, content)
  return zip.generateAsync({ type: 'uint8array' })
}

function buildDb(
  SQL: SqlJsStatic,
  models: Record<string, unknown>,
  notes: NoteSpec[],
  cards: CardSpec[],
): Uint8Array {
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER, models TEXT, decks TEXT);
    CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, flds TEXT, tags TEXT);
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER,
      type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER,
      reps INTEGER, lapses INTEGER, mod INTEGER
    );
  `)
  db.run('INSERT INTO col (id, crt, models, decks) VALUES (1, ?, ?, ?)', [
    FIXTURE_CRT,
    JSON.stringify(models),
    JSON.stringify({ '1': { name: 'Default' } }),
  ])
  const noteIdByGuid = new Map<string, number>()
  notes.forEach((n, i) => {
    const noteId = 1000 + i
    noteIdByGuid.set(n.guid, noteId)
    db.run('INSERT INTO notes (id, guid, mid, flds, tags) VALUES (?, ?, ?, ?, ?)', [
      noteId,
      n.guid,
      n.mid,
      n.fields.join(SEP),
      n.tags ?? '',
    ])
  })
  for (const c of cards) {
    const s = c.sched ?? {}
    db.run(
      `INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, reps, lapses, mod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        noteIdByGuid.get(c.noteGuid) ?? 0,
        1,
        c.ord,
        s.type ?? 0,
        s.queue ?? 0,
        s.due ?? c.ord,
        s.ivl ?? 0,
        s.reps ?? 0,
        s.lapses ?? 0,
        s.mod ?? 0,
      ],
    )
  }
  const bytes = db.export()
  db.close()
  return bytes
}

const BASIC_MODEL = {
  '1': {
    name: 'Basic',
    flds: [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ],
    tmpls: [
      {
        name: 'Card 1',
        ord: 0,
        qfmt: '{{Front}}',
        afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
    ],
  },
}

const CLOZE_MODEL = {
  '2': {
    name: 'Cloze',
    flds: [
      { name: 'Text', ord: 0 },
      { name: 'Extra', ord: 1 },
    ],
    tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Extra}}' }],
  },
}

/**
 * Notetype whose FIRST field is a numeric rank, with the real question in a
 * later field. The template (not field position) decides front/back. This
 * reproduces the import bug where front showed the number and back showed the
 * actual front.
 */
const LEADING_NUMBER_MODEL = {
  '3': {
    name: 'Ranked',
    flds: [
      { name: 'Rank', ord: 0 },
      { name: 'Word', ord: 1 },
      { name: 'Meaning', ord: 2 },
    ],
    tmpls: [
      {
        name: 'Card 1',
        ord: 0,
        qfmt: '{{Word}}',
        afmt: '{{FrontSide}}<hr id=answer>{{Meaning}}',
      },
    ],
  },
}

/** A normal Basic deck: 3 cards, HTML in fields, tags, one with <img>. */
export function buildBasicApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  const notes: NoteSpec[] = [
    { guid: 'a', mid: 1, fields: ['<b>Capital of France?</b>', 'Paris'], tags: 'geo europe' },
    { guid: 'b', mid: 1, fields: ['2 + 2 = ?', 'four'], tags: '' },
    { guid: 'c', mid: 1, fields: ['Photo<br>caption <img src="x.jpg">', 'An <i>answer</i>'] },
  ]
  const cards: CardSpec[] = notes.map((n, i) => ({
    id: 100 + i,
    noteGuid: n.guid,
    ord: 0,
  }))
  return zipApkg({
    'collection.anki21': buildDb(SQL, BASIC_MODEL, notes, cards),
    media: '{}',
  })
}

/**
 * A deck already studied in Anki: one brand-new card, one mature review card
 * (interval 15 days, due 100 days after collection creation), and one lapsed
 * relearning card. Used to verify the importer resumes Anki's scheduling
 * instead of resetting everything to new.
 */
export function buildStudiedApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  const notes: NoteSpec[] = [
    { guid: 'new1', mid: 1, fields: ['Never studied?', 'right'] },
    { guid: 'rev1', mid: 1, fields: ['Mature review?', 'yes'] },
    { guid: 'lap1', mid: 1, fields: ['Lapsed card?', 'relearning'] },
  ]
  const cards: CardSpec[] = [
    { id: 500, noteGuid: 'new1', ord: 0, sched: { type: 0, queue: 0, reps: 0 } },
    {
      id: 501,
      noteGuid: 'rev1',
      ord: 0,
      // review card: due is days-since-crt; ivl 15 days; 8 reps, 1 lapse.
      sched: { type: 2, queue: 2, due: 100, ivl: 15, reps: 8, lapses: 1, mod: 1_650_000_000 },
    },
    {
      id: 502,
      noteGuid: 'lap1',
      ord: 0,
      // relearning: due is an epoch-seconds timestamp; short interval.
      sched: { type: 3, queue: 1, due: 1_650_500_000, ivl: 1, reps: 12, lapses: 3, mod: 1_650_400_000 },
    },
  ]
  return zipApkg({
    'collection.anki21': buildDb(SQL, BASIC_MODEL, notes, cards),
    media: '{}',
  })
}

/** Mixed deck: 1 basic card + 2 cloze cards (one by notetype, one by markup). */
export function buildMixedClozeApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  const notes: NoteSpec[] = [
    { guid: 'd', mid: 1, fields: ['Basic front', 'Basic back'] },
    { guid: 'e', mid: 2, fields: ['The {{c1::mitochondria}} is the powerhouse.', ''] },
    // Basic notetype but cloze markup snuck in — should still be skipped.
    { guid: 'f', mid: 1, fields: ['{{c1::hidden}} word', 'x'] },
  ]
  const cards: CardSpec[] = notes.map((n, i) => ({
    id: 200 + i,
    noteGuid: n.guid,
    ord: 0,
  }))
  return zipApkg({
    'collection.anki2': buildDb(SQL, { ...BASIC_MODEL, ...CLOZE_MODEL }, notes, cards),
    media: '{}',
  })
}

/**
 * Deck whose notetype leads with a numeric field; front/back must come from the
 * template, not field position. Front should be the word, back the meaning —
 * never the rank number.
 */
export function buildLeadingNumberApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  const notes: NoteSpec[] = [
    { guid: 'r1', mid: 3, fields: ['1', 'Bonjour', 'Hello'] },
    { guid: 'r2', mid: 3, fields: ['2', 'Merci', 'Thank you'] },
  ]
  const cards: CardSpec[] = notes.map((n, i) => ({
    id: 300 + i,
    noteGuid: n.guid,
    ord: 0,
  }))
  return zipApkg({
    'collection.anki21': buildDb(SQL, LEADING_NUMBER_MODEL, notes, cards),
    media: '{}',
  })
}

/**
 * Deck with one normal Basic card and one media-only card (image front, audio
 * back) that strips to empty text — the importer should skip the media-only one.
 */
export function buildMediaApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  const notes: NoteSpec[] = [
    { guid: 'm1', mid: 1, fields: ['Real question?', 'Real answer'] },
    { guid: 'm2', mid: 1, fields: ['<img src="diagram.png">', '[sound:answer.mp3]'] },
  ]
  const cards: CardSpec[] = notes.map((n, i) => ({
    id: 400 + i,
    noteGuid: n.guid,
    ord: 0,
  }))
  return zipApkg({
    'collection.anki21': buildDb(SQL, BASIC_MODEL, notes, cards),
    media: '{}',
  })
}

/** Valid db but zero cards. */
export function buildEmptyApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  return zipApkg({
    'collection.anki21': buildDb(SQL, BASIC_MODEL, [], []),
    media: '{}',
  })
}

/** Newer-format export: zstd-compressed db present, no legacy db. */
export function buildNewerFormatApkg(): Promise<Uint8Array> {
  return zipApkg({
    'collection.anki21b': new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]), // zstd magic
    media: '{}',
  })
}

/** Legacy db present but col.models empty (newer notetypes-table schema). */
export function buildEmptyModelsApkg(SQL: SqlJsStatic): Promise<Uint8Array> {
  return zipApkg({
    'collection.anki21': buildDb(SQL, {}, [], []),
    media: '{}',
  })
}

/** A zip with no collection database at all. */
export function buildNoDbApkg(): Promise<Uint8Array> {
  return zipApkg({ media: '{}', '0': 'not a db' })
}

/** Not a zip at all. */
export function buildJunk(): Uint8Array {
  return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
}
