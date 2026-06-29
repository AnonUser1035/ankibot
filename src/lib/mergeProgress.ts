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
 *  - a matched card keeps the existing `reviewState` + `coaching`, takes the
 *    imported content (so edits in Anki still land);
 *  - an imported card with no match stays fresh (genuinely new card);
 *  - an existing card absent from the import is dropped (removed from the deck).
 *
 * No mutation of either input. The result's identity (id/name/importedAt) is
 * the imported deck's.
 */
import type { Deck } from '../types/deck'

export function mergeProgress(existing: Deck, imported: Deck): Deck {
  const prior = new Map(existing.cards.map((c) => [c.id, c]))
  return {
    ...imported,
    cards: imported.cards.map((card) => {
      const old = prior.get(card.id)
      if (!old) return card
      return {
        ...card,
        reviewState: old.reviewState,
        // Fall back to the import's fresh coaching if the old record somehow
        // lacked one (defensive — migrate() normally fills it).
        coaching: old.coaching ?? card.coaching,
      }
    }),
  }
}
