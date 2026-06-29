/**
 * IndexedDB autosave — the convenient everyday persistence layer.
 *
 * This is one of two storage paths; both go through the SAME serializer
 * (saveFile.ts). IndexedDB is the zero-effort layer that survives reloads; the
 * exported file (export.ts) is the durable backup that outlives this browser.
 *
 * Schema (DB_VERSION 1):
 *  - `decks` store: keyed by deck id, value is a `SaveFile` (canonical form).
 *    Keyed-by-id so multiple decks can coexist later without a migration.
 *  - `meta` store: holds `activeDeckId` so boot knows which deck to restore.
 *
 * Every call is wrapped so storage failures (private browsing, quota, blocked
 * IndexedDB) surface as a typed StorageError instead of a silent crash.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { deckIdFromCards } from './deckId'
import { type SaveFile, deserialize, serialize } from './saveFile'
import type { Deck } from '../types/deck'

const DB_NAME = 'ankibot'
const DB_VERSION = 1
const DECKS_STORE = 'decks'
const META_STORE = 'meta'
const ACTIVE_DECK_KEY = 'activeDeckId'
/** BYO Anthropic key (phase 7) — the USER's own key, stored in THEIR browser. */
const USER_API_KEY = 'userApiKey'

interface AnkibotDB extends DBSchema {
  decks: { key: string; value: SaveFile }
  meta: { key: string; value: string }
}

/** A typed, user-facing failure for any IndexedDB operation. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

let dbPromise: Promise<IDBPDatabase<AnkibotDB>> | null = null

function getDb(): Promise<IDBPDatabase<AnkibotDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AnkibotDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DECKS_STORE)) {
          db.createObjectStore(DECKS_STORE)
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE)
        }
      },
    }).catch((err) => {
      // Reset so a later call can retry rather than reusing a rejected promise.
      dbPromise = null
      throw wrap(err, "Couldn't open local storage")
    })
  }
  return dbPromise
}

/**
 * Persist a deck and mark it active. Called after every answer and on import —
 * writes are small, so per-answer is fine (debounce only if profiling says so).
 */
export async function persistDeck(deck: Deck): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction([DECKS_STORE, META_STORE], 'readwrite')
    await Promise.all([
      tx.objectStore(DECKS_STORE).put(serialize(deck), deck.id),
      tx.objectStore(META_STORE).put(deck.id, ACTIVE_DECK_KEY),
      tx.done,
    ])
  } catch (err) {
    throw wrap(err, "Couldn't save your progress to this browser")
  }
}

/**
 * Restore the active deck on boot. Returns null if storage is empty (fall
 * through to the import prompt). Throws StorageError on I/O failure and
 * SaveFileError (from deserialize) if the stored record is corrupt.
 *
 * Legacy decks were keyed by filename; current imports key by a content-derived
 * id. If the active record is still filename-keyed, re-key it to the content id
 * here so a later re-import finds it and merges progress. The migration is
 * best-effort: a write failure never blocks boot (the in-memory id is already
 * corrected, and the next answer's autosave re-keys it under persistDeck).
 */
export async function loadActiveDeck(): Promise<Deck | null> {
  let db: IDBPDatabase<AnkibotDB>
  let activeId: string | undefined
  let record: SaveFile | undefined
  try {
    db = await getDb()
    activeId = await db.get(META_STORE, ACTIVE_DECK_KEY)
    if (!activeId) return null
    record = await db.get(DECKS_STORE, activeId)
    if (!record) return null
  } catch (err) {
    throw wrap(err, "Couldn't read your saved progress")
  }
  // deserialize throws SaveFileError on its own — let that propagate untouched.
  const deck = deserialize(record).deck

  const contentId = deckIdFromCards(deck.cards)
  if (deck.id === contentId) return deck

  const migrated: Deck = { ...deck, id: contentId }
  try {
    const tx = db.transaction([DECKS_STORE, META_STORE], 'readwrite')
    await Promise.all([
      tx.objectStore(DECKS_STORE).put(serialize(migrated), contentId),
      tx.objectStore(META_STORE).put(contentId, ACTIVE_DECK_KEY),
      activeId !== contentId
        ? tx.objectStore(DECKS_STORE).delete(activeId)
        : Promise.resolve(),
      tx.done,
    ])
  } catch {
    // Ignore — return the migrated deck regardless; persistDeck fixes storage
    // on the next answer.
  }
  return migrated
}

/**
 * Read a saved deck by id, or null if absent. Used by import to find an existing
 * deck to merge progress from. Never throws: a read/parse failure yields null so
 * import degrades to a fresh (non-destructive-intent) deck rather than crashing.
 */
export async function getDeck(id: string): Promise<Deck | null> {
  try {
    const db = await getDb()
    const record = await db.get(DECKS_STORE, id)
    if (!record) return null
    return deserialize(record).deck
  } catch {
    return null
  }
}

/** Wipe all saved data (both stores). Used by "Clear saved data". */
export async function clearAllSavedData(): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction([DECKS_STORE, META_STORE], 'readwrite')
    await Promise.all([
      tx.objectStore(DECKS_STORE).clear(),
      tx.objectStore(META_STORE).clear(),
      tx.done,
    ])
  } catch (err) {
    throw wrap(err, "Couldn't clear your saved data")
  }
}

// --- BYO API key (phase 7) -------------------------------------------------
// This is the user's OWN Anthropic key, stored locally in their browser at their
// own risk. Ryan's key is never here — it lives only as a Worker secret.

export async function getStoredApiKey(): Promise<string | null> {
  try {
    const db = await getDb()
    return (await db.get(META_STORE, USER_API_KEY)) ?? null
  } catch {
    return null // never block the app on a key read
  }
}

export async function storeApiKey(key: string): Promise<void> {
  try {
    const db = await getDb()
    await db.put(META_STORE, key, USER_API_KEY)
  } catch (err) {
    throw wrap(err, "Couldn't save your API key to this browser")
  }
}

export async function deleteStoredApiKey(): Promise<void> {
  try {
    const db = await getDb()
    await db.delete(META_STORE, USER_API_KEY)
  } catch (err) {
    throw wrap(err, "Couldn't clear your saved API key")
  }
}

function wrap(err: unknown, prefix: string): StorageError {
  const detail = err instanceof Error ? err.message : String(err)
  return new StorageError(
    `${prefix}. Your browser may be in private mode or out of space. (${detail})`,
  )
}
