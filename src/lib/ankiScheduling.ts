/**
 * Map Anki's native card scheduling onto our Leitner `ReviewState` — PURE and
 * deterministic.
 *
 * The importer used to reset every card to "new", discarding months of study.
 * This carries an already-studied Anki card forward so a deck resumes instead
 * of starting over. We faithfully REIMPLEMENT Anki's encoding (algorithms aren't
 * copyrightable); no Anki code is copied — important because Anki is AGPL.
 *
 * Anki's `cards` columns we read:
 *  - type:   0 new · 1 learning · 2 review · 3 relearning
 *  - queue:  0 new · 1 learning(intraday) · 2 review · 3 day-learning · <0 suspended/buried
 *  - due:    new → position (ignored) · review → DAYS since collection creation
 *            (`col.crt`, epoch seconds) · learning → epoch-seconds timestamp
 *  - ivl:    interval. ≥0 → days · <0 → negative seconds (sub-day, older format)
 *  - reps:   total reviews · lapses: times forgotten · mod: last change (epoch s)
 *
 * Mapping is intentionally pragmatic, not a bit-exact port of Anki's scheduler:
 * we preserve maturity (interval → box), due date, reps and lapses, which is
 * what "resume where I left off" needs. Edge encodings fall back to "due now".
 */
import { type ReviewState, newReviewState } from '../types/deck'
import { DEFAULT_SRS_CONFIG, type SrsConfig } from './srs'

const SECONDS_PER_DAY = 86400
/** Above this, a `due` value is an epoch-seconds timestamp, not a day count. */
const TIMESTAMP_THRESHOLD = 10_000_000

/** The subset of an Anki `cards` row that drives scheduling. */
export interface AnkiSchedule {
  type: number
  queue: number
  due: number
  ivl: number
  reps: number
  lapses: number
  /** Last modified, epoch SECONDS (Anki's unit). */
  mod: number
}

/**
 * Build a `ReviewState` from an Anki card's scheduling. `colCrt` is the
 * collection creation time in epoch SECONDS (from `col.crt`); `now` is injected.
 * A never-studied card (reps ≤ 0 or type new) becomes a fresh new card.
 */
export function reviewStateFromAnki(
  s: AnkiSchedule,
  colCrt: number,
  now: number,
  config: SrsConfig = DEFAULT_SRS_CONFIG,
): ReviewState {
  if (s.reps <= 0 || s.type === 0) return newReviewState(now)

  const ivlDays = s.ivl >= 0 ? s.ivl : Math.ceil(-s.ivl / SECONDS_PER_DAY)
  return {
    box: boxFromInterval(ivlDays, config),
    due: dueMs(s, colCrt, now),
    reps: s.reps,
    lapses: Math.max(0, s.lapses),
    lastReviewed: s.mod > 0 ? s.mod * 1000 : null,
  }
}

/** Pick the Leitner box whose interval best matches Anki's day interval. */
function boxFromInterval(ivlDays: number, config: SrsConfig): number {
  const intervals = config.intervalsDays
  let box = 1 // studied at least once → never below box 1
  for (let b = 0; b < intervals.length; b++) {
    if (intervals[b] <= ivlDays) box = b
  }
  return Math.max(1, Math.min(box, intervals.length - 1))
}

/** Resolve an Anki due value (days-since-crt or epoch-seconds) to epoch ms. */
function dueMs(s: AnkiSchedule, colCrt: number, now: number): number {
  // Learning/relearning store an absolute epoch-seconds due.
  if (s.queue === 1 || s.queue === 3 || s.type === 1 || s.type === 3) {
    return s.due > TIMESTAMP_THRESHOLD ? s.due * 1000 : now
  }
  // Review cards store due as whole days since collection creation.
  if (colCrt > 0 && s.due >= 0 && s.due < TIMESTAMP_THRESHOLD) {
    return (colCrt + s.due * SECONDS_PER_DAY) * 1000
  }
  // Unknown encoding (or missing crt): make it available now rather than guess.
  return now
}
