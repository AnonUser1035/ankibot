/**
 * In-memory study session — this-session-only ordering, NOT persisted.
 *
 * Separate from the persistent scheduler (srs.ts): this layer decides what you
 * see *right now*, including re-drilling a missed card a few positions back so
 * it reappears this session without an immediate repeat.
 *
 * The deck remains the single source of truth for card data; the queue holds
 * only card ids. `answerCurrent` returns the rescheduled card so the caller can
 * write it back into the deck.
 */
import { type Grade, type SrsConfig, applyAnswer } from './srs'
import type { Card } from '../types/deck'

export interface SessionStats {
  reviewed: number
  correct: number
  missed: number
}

export interface SessionState {
  /** Ordered card ids still to study this session. queue[0] is current. */
  queue: string[]
  stats: SessionStats
}

export function startSession(cards: Card[]): SessionState {
  return {
    queue: cards.map((c) => c.id),
    stats: { reviewed: 0, correct: 0, missed: 0 },
  }
}

export function currentCardId(state: SessionState): string | null {
  return state.queue[0] ?? null
}

export function remaining(state: SessionState): number {
  return state.queue.length
}

export function isComplete(state: SessionState): boolean {
  return state.queue.length === 0
}

export interface AnswerOutcome {
  state: SessionState
  /** The rescheduled card — write this back into the deck. */
  updatedCard: Card
}

/**
 * Grade the current card. Returns the next session state and the rescheduled
 * card. On `correct` the card leaves the session; on `incorrect` it is
 * re-inserted ~`reinsertGap` positions back to re-drill without repeating.
 */
export function answerCurrent(
  state: SessionState,
  current: Card,
  grade: Grade,
  now: number,
  config: SrsConfig,
): AnswerOutcome {
  const updatedCard = applyAnswer(current, grade, now, config)

  const rest = state.queue.slice(1)
  const stats: SessionStats = {
    reviewed: state.stats.reviewed + 1,
    correct: state.stats.correct + (grade === 'correct' ? 1 : 0),
    missed: state.stats.missed + (grade === 'incorrect' ? 1 : 0),
  }

  let queue: string[]
  if (grade === 'correct') {
    queue = rest
  } else {
    // Re-insert the missed card reinsertGap positions back (or at the end if
    // the remaining queue is shorter than the gap).
    const insertAt = Math.min(config.reinsertGap, rest.length)
    queue = [...rest.slice(0, insertAt), current.id, ...rest.slice(insertAt)]
  }

  return { state: { queue, stats }, updatedCard }
}
