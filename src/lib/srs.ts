/**
 * Leitner spaced-repetition engine — PURE and deterministic.
 *
 * Rules for everything in this module:
 *  - No React, no I/O, no module-level state.
 *  - Never call Date.now(); the current time is always an injected `now` (ms).
 *  - Never mutate inputs; return new objects.
 *
 * This is what makes the scheduler unit-testable by simulating future dates —
 * intervals are in days, so we can't wait real time to verify box 3 -> box 4.
 */
import type { Card, Deck } from '../types/deck'

export type Grade = 'correct' | 'incorrect'

const DAY_MS = 24 * 60 * 60 * 1000

export interface SrsConfig {
  /** Interval in days per box; index = box number. Box 0 is due immediately. */
  intervalsDays: number[]
  /** Max new cards (reps === 0) admitted per session. */
  newCardsPerSession: number
  /** Optional cap on review (reps > 0) cards per session. */
  maxReviewsPerSession?: number
  /** How many positions back a missed card is re-inserted within a session. */
  reinsertGap: number
}

export const DEFAULT_SRS_CONFIG: SrsConfig = {
  intervalsDays: [0, 1, 2, 4, 8, 16],
  newCardsPerSession: 20,
  reinsertGap: 3,
}

/** Highest box index for a given config. */
export function maxBox(config: SrsConfig): number {
  return config.intervalsDays.length - 1
}

/** A card is due when its scheduled time has arrived. */
export function isDue(card: Card, now: number): boolean {
  return card.reviewState.due <= now
}

/** A card never reviewed is "new". */
export function isNew(card: Card): boolean {
  return card.reviewState.reps === 0
}

/**
 * Apply a grade to a card, returning a NEW card with updated scheduling.
 *  - correct: advance one box (capped), reschedule by the new box's interval.
 *  - incorrect: reset to box 0, due now (so it returns next session too), lapse.
 */
export function applyAnswer(
  card: Card,
  grade: Grade,
  now: number,
  config: SrsConfig = DEFAULT_SRS_CONFIG,
): Card {
  const rs = card.reviewState

  if (grade === 'correct') {
    const box = Math.min(rs.box + 1, maxBox(config))
    return {
      ...card,
      reviewState: {
        box,
        due: now + config.intervalsDays[box] * DAY_MS,
        reps: rs.reps + 1,
        lapses: rs.lapses,
        lastReviewed: now,
      },
    }
  }

  // incorrect
  return {
    ...card,
    reviewState: {
      box: 0,
      due: now, // interval[0] is 0 days — due again immediately / next session
      reps: rs.reps + 1,
      lapses: rs.lapses + 1,
      lastReviewed: now,
    },
  }
}

export interface BuildSessionOptions {
  /**
   * Study-ahead: include not-yet-due cards too (ordered by soonest due).
   * Their schedule isn't altered until they're actually answered.
   */
  studyAhead?: boolean
}

/**
 * Collect the queue of cards to study at session start.
 * Default: due cards only, new cards capped, ordered due-ascending with new
 * cards interleaved. Study-ahead: include everything, soonest-due first.
 */
export function buildSession(
  deck: Deck,
  now: number,
  config: SrsConfig = DEFAULT_SRS_CONFIG,
  options: BuildSessionOptions = {},
): Card[] {
  const pool = options.studyAhead
    ? deck.cards
    : deck.cards.filter((c) => isDue(c, now))

  const byDueAsc = (a: Card, b: Card) => a.reviewState.due - b.reviewState.due

  const news = pool.filter(isNew).sort(byDueAsc).slice(0, config.newCardsPerSession)

  let reviews = pool.filter((c) => !isNew(c)).sort(byDueAsc)
  if (config.maxReviewsPerSession != null) {
    reviews = reviews.slice(0, config.maxReviewsPerSession)
  }

  return interleave(reviews, news)
}

/**
 * Merge reviews and new cards so new cards are spread through the queue rather
 * than all clustered at the end. Deterministic (no randomness) for testability.
 */
function interleave(reviews: Card[], news: Card[]): Card[] {
  if (reviews.length === 0) return news
  if (news.length === 0) return reviews

  const out: Card[] = []
  const step = (reviews.length + news.length) / news.length
  let nextNewAt = 0
  let ni = 0
  for (let ri = 0; ri < reviews.length; ri++) {
    while (ni < news.length && out.length >= nextNewAt) {
      out.push(news[ni++])
      nextNewAt += step
    }
    out.push(reviews[ri])
  }
  while (ni < news.length) out.push(news[ni++])
  return out
}
