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

/**
 * Per-card coaching memory (phase 6). A compact, evolving "what you keep getting
 * wrong" note that persists across sessions and is fed back into the tutor's
 * context. It NEVER influences scheduling — it only enriches AI help and the
 * rating suggestion. Optional on the card: absent === no memory yet, so the app
 * degrades to phase-4 behavior when it's missing.
 */
export interface Coaching {
  /** A single evolving one-liner the model rewrites — not an accumulating log. */
  note?: string
  /** The learner's most recent wrong answer (deterministic baseline). */
  lastWrongAnswer?: string
  /** How many times this card has been missed. */
  missCount: number
  /** Last time coaching changed (epoch ms), or 0 if never. */
  updatedAt: number
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
  /**
   * Coaching memory (phase 6). Optional so phase-4 saves and cards without
   * memory keep working — treat absent as "empty". Only the human's button
   * press mutates SRS; coaching is pure enrichment alongside it.
   */
  coaching?: Coaching
}

/**
 * Per-day new-card budget ledger (phase 8). Tracks how many brand-new cards
 * have been introduced (first studied) on a given local day, so the scheduler
 * can enforce an Anki-style daily new-card limit instead of serving an unbounded
 * 20 every session. Resets implicitly: a `day` that isn't today means zero
 * introduced today. Optional so older saves (and fresh imports) read as "none".
 */
export interface DailyNew {
  /** Local-midnight epoch ms of the day this count applies to. */
  day: number
  /** New cards introduced (first studied) on that day. */
  introduced: number
}

export interface Deck {
  id: string
  name: string
  /** Import time, epoch ms. */
  importedAt: number
  cards: Card[]
  /**
   * Today's new-card introductions (phase 8). Absent === none introduced today.
   * The scheduler subtracts this from the daily limit; the answer flow bumps it
   * the first time each new card is studied.
   */
  dailyNew?: DailyNew
}

/** Build a fresh "new card" review state. Phase 3 owns all later transitions. */
export function newReviewState(now: number): ReviewState {
  return { box: 0, due: now, reps: 0, lapses: 0, lastReviewed: null }
}

/** Build an empty coaching record (no memory yet). */
export function newCoaching(): Coaching {
  return { missCount: 0, updatedAt: 0 }
}
