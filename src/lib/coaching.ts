/**
 * Coaching memory updates — PURE and deterministic, applied on the human's
 * rating press (never by the AI).
 *
 * Two layers, matching the spec:
 *  - Deterministic baseline (ALWAYS): on a miss, bump `missCount` and record the
 *    learner's last wrong answer. This works even with no AI involved.
 *  - AI enrichment (WHEN PRESENT): if the tutor returned a `memoryNote`, store it
 *    as the single evolving one-liner (the model rewrites it each time).
 *
 * This module does not touch SRS/review state — that's the button press via
 * applyAnswer. Coaching rides alongside it.
 */
import { type Card, type Coaching, newCoaching } from '../types/deck'
import type { Grade } from './srs'

/** Extra info gathered from the tutor's verdict at press time (all optional). */
export interface CoachingInput {
  /** The learner's most recent typed answer (from the chat). */
  lastAnswer?: string
  /** The AI's evolving one-liner note, or null/undefined if none. */
  memoryNote?: string | null
}

/**
 * Compute the card's next coaching record for a graded press. Returns the prior
 * record unchanged (same reference) when nothing changed, so callers can skip
 * needless writes.
 */
export function applyCoaching(
  card: Card,
  grade: Grade,
  input: CoachingInput | undefined,
  now: number,
): Coaching {
  const prev = card.coaching ?? newCoaching()
  const next: Coaching = { ...prev }
  let changed = false

  if (grade === 'incorrect') {
    next.missCount = prev.missCount + 1
    changed = true
    const ans = input?.lastAnswer?.trim()
    if (ans) next.lastWrongAnswer = ans
  }

  // memoryNote present (non-null) replaces the evolving note; null means "leave
  // the prior note as-is" (enrichment is optional, never destructive on its own).
  if (input?.memoryNote != null) {
    const note = input.memoryNote.trim()
    next.note = note || undefined
    changed = true
  }

  if (!changed) return prev
  next.updatedAt = now
  return next
}
