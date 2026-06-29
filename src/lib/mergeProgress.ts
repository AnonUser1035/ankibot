/**
 * Carry SRS + coaching progress forward across a re-import — PURE and
 * deterministic.
 *
 * Import always rebuilds cards at new-card defaults; persisting that blindly
 * would wipe a studied deck. This merges an `imported` deck (the source of
 * truth for card CONTENT) with the `existing` saved deck (the source of truth
 * for PROGRESS):
 *
 *  - matched by stable card id (`guid:ord`), not array position or text;
 *  - in-app study always wins: a card studied here (reps > 0) keeps its existing
 *    `reviewState`, taking only the imported content (so Anki edits still land);
 *  - a card NOT yet studied here adopts the import's `reviewState` — this lets a
 *    re-import refresh scheduling, including Anki history the importer now reads,
 *    without clobbering anything you've actually reviewed in the app;
 *  - coaching memory is always carried forward when present;
 *  - an imported card with no match stays as imported (new, or Anki-scheduled);
 *  - an existing card absent from the import is dropped (removed from the deck).
 *
 * No mutation of either input. The result's identity (id/name/importedAt) is
 * the imported deck's.
 */
import { isNew } from './srs'
import type { Deck } from '../types/deck'

export function mergeProgress(existing: Deck, imported: Deck): Deck {
  const prior = new Map(existing.cards.map((c) => [c.id, c]))
  return {
    ...imported,
    cards: imported.cards.map((card) => {
      const old = prior.get(card.id)
      if (!old) return card
      // Carry coaching forward regardless of who owns the schedule.
      const coaching = old.coaching ?? card.coaching
      // Studied in-app → protect that progress. Otherwise let the import's
      // schedule (fresh-new, or resumed Anki history) take over.
      const reviewState = isNew(old) ? card.reviewState : old.reviewState
      return { ...card, reviewState, coaching }
    }),
  }
}
