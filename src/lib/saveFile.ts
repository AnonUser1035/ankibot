/**
 * Canonical save format — the SINGLE serialized shape used by BOTH the
 * exported backup file and the IndexedDB record. There is exactly one
 * serializer/deserializer pair; never write a second save path.
 *
 * Design rules (phase 4, see spec):
 *  - Versioned from day one. `version` lets us migrate our own saves later
 *    (e.g. coaching notes in phase 6) instead of guessing at field presence.
 *  - Forward-compatible: unknown fields are ignored on read, never rejected,
 *    so a newer build's extra data doesn't brick an older reader of the same
 *    major version.
 *  - Serializes the REAL `Deck` shape from types/deck.ts — including every
 *    card's full `reviewState`. We do not redefine the model here.
 */
import type { Card, Deck, ReviewState } from '../types/deck'

/**
 * Bump when the serialized structure changes in a way that needs migration.
 * v1 is the initial format; `migrate` is a pass-through stub at v1.
 */
export const SAVE_FORMAT_VERSION = 1

/** The on-disk / in-IndexedDB record. Plain JSON, no class instances. */
export interface SaveFile {
  version: number
  /** When this snapshot was serialized, epoch ms. */
  exportedAt: number
  deck: Deck
}

/** A typed, user-facing failure for loading a save (file or IndexedDB record). */
export class SaveFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveFileError'
  }
}

/**
 * Produce the canonical serialized form for a deck. Used for both the file
 * download and the IndexedDB write. `now` defaults to wall-clock time but is
 * injectable for deterministic tests.
 */
export function serialize(deck: Deck, now: number = Date.now()): SaveFile {
  return { version: SAVE_FORMAT_VERSION, exportedAt: now, deck }
}

/**
 * Validate and load a save record (parsed JSON object, NOT a raw string).
 * Returns the deck plus the version it was stored at. Throws SaveFileError on
 * anything malformed, version mismatch we can't handle, or structural damage.
 */
export function deserialize(input: unknown): { deck: Deck; version: number } {
  if (!isObject(input)) {
    throw new SaveFileError(
      "This file isn't a valid ankibot save. Pick a file you exported from ankibot.",
    )
  }

  const version = input.version
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new SaveFileError(
      "This save file is missing its format version and can't be read.",
    )
  }
  if (version > SAVE_FORMAT_VERSION) {
    throw new SaveFileError(
      `This save was made by a newer version of ankibot (format v${version}). ` +
        'Update ankibot, then import it again.',
    )
  }

  const deck = parseDeck(input.deck)
  const migrated = migrate(deck, version)
  return { deck: migrated, version }
}

/**
 * Migrate a deck from an older save format up to the current one. At v1 this is
 * a pass-through; later versions add steps here (one per intermediate version)
 * so old backups keep loading after the model grows.
 */
function migrate(deck: Deck, fromVersion: number): Deck {
  let current = deck
  // Example for the future:
  //   if (fromVersion < 2) current = addCoachingDefaults(current)
  void fromVersion
  return current
}

/** Suggested download filename: `<deckname>-<YYYYMMDD>.ankitutor.json`. */
export function saveFileName(deck: Deck, now: number = Date.now()): string {
  const slug =
    deck.name
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'deck'
  return `${slug}-${yyyymmdd(now)}.ankitutor.json`
}

// --- validation helpers ----------------------------------------------------

function parseDeck(value: unknown): Deck {
  if (!isObject(value)) {
    throw new SaveFileError('This save file has no deck data.')
  }
  const { id, name, importedAt, cards } = value
  if (typeof id !== 'string' || typeof name !== 'string') {
    throw new SaveFileError('This save file is missing its deck name or id.')
  }
  if (!Array.isArray(cards)) {
    throw new SaveFileError('This save file has no cards.')
  }
  return {
    id,
    name,
    importedAt: typeof importedAt === 'number' ? importedAt : 0,
    cards: cards.map((c, i) => parseCard(c, i)),
  }
}

function parseCard(value: unknown, index: number): Card {
  if (!isObject(value)) {
    throw new SaveFileError(`Card #${index + 1} in this save file is malformed.`)
  }
  const { id, ankiNoteId, noteType, fields, front, back, tags, reviewState } =
    value
  if (typeof id !== 'string') {
    throw new SaveFileError(`Card #${index + 1} in this save file has no id.`)
  }
  return {
    id,
    ankiNoteId: typeof ankiNoteId === 'number' ? ankiNoteId : 0,
    noteType: typeof noteType === 'string' ? noteType : 'Unknown',
    fields: isObject(fields) ? (fields as Record<string, string>) : {},
    front: typeof front === 'string' ? front : '',
    back: typeof back === 'string' ? back : '',
    tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [],
    reviewState: parseReviewState(reviewState, index),
  }
}

function parseReviewState(value: unknown, index: number): ReviewState {
  if (!isObject(value)) {
    throw new SaveFileError(
      `Card #${index + 1} in this save file is missing its review progress.`,
    )
  }
  const { box, due, reps, lapses, lastReviewed } = value
  return {
    box: typeof box === 'number' ? box : 0,
    due: typeof due === 'number' ? due : 0,
    reps: typeof reps === 'number' ? reps : 0,
    lapses: typeof lapses === 'number' ? lapses : 0,
    lastReviewed: typeof lastReviewed === 'number' ? lastReviewed : null,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function yyyymmdd(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
