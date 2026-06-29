/**
 * Normalized in-memory data model for ankibot.
 *
 * This is the contract that phases 3 (SRS), 4 (persistence), and 6 (coaching)
 * build on. It is intentionally designed to *hold* review-state and coaching
 * fields even though the phase-2 importer only initializes their defaults.
 * The `.apkg` import seeds card *content* only — never scheduling.
 */

/** Per-card scheduling state owned by our own SRS (phase 3 mutates this). */
export interface ReviewState {
  /** Leitner box. New cards start at 0. Phase 3 owns all transitions. */
  box: number
  /** When the card is next due, as a Unix epoch (ms). Defaults to import time. */
  due: number
  /** Number of times reviewed. */
  reps: number
  /** Number of times the card lapsed (forgotten). */
  lapses: number
  /** Last review time (epoch ms), or null if never reviewed. */
  lastReviewed: number | null
}

export interface Card {
  /** Stable id derived from the Anki note guid + template ordinal. */
  id: string
  /** Source Anki note id (provenance; not used for scheduling). */
  ankiNoteId: number
  /** Notetype name (e.g. "Basic"). */
  noteType: string
  /** All fields, named (e.g. { Front: "...", Back: "..." }). */
  fields: Record<string, string>
  /** Plaintext front (first field), HTML stripped. */
  front: string
  /** Plaintext back (second field), HTML stripped. */
  back: string
  /** Note tags. */
  tags: string[]
  /** Our scheduling state. Initialized to "new card" defaults on import. */
  reviewState: ReviewState
}

export interface Deck {
  id: string
  name: string
  /** Import time, epoch ms. */
  importedAt: number
  cards: Card[]
}

/** Build a fresh "new card" review state. Phase 3 owns all later transitions. */
export function newReviewState(now: number): ReviewState {
  return { box: 0, due: now, reps: 0, lapses: 0, lastReviewed: null }
}
