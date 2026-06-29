/**
 * Stable, content-derived deck identity — PURE and deterministic.
 *
 * A deck's storage id is a function of WHICH cards it contains (their stable
 * `guid:ord` ids), not the import filename. This is what lets the same deck,
 * re-imported — even from a renamed file — resolve to the same saved record so
 * progress can be carried forward (see mergeProgress.ts). Editing a card's text
 * does not change the id; adding or removing a card does.
 *
 * The id is the concatenation of two independent 32-bit hashes (FNV-1a and
 * djb2) over the sorted card ids, giving a 64-bit space so genuinely different
 * decks practically never collide. Even on a collision, the card-level merge is
 * keyed by exact card id, so no card's progress can be mis-assigned.
 */

/** Derive a deck's stable storage id from its card ids. Order-independent. */
export function deckIdFromCards(cards: ReadonlyArray<{ id: string }>): string {
  const key = cards
    .map((c) => c.id)
    .sort()
    .join('\n')
  return `deck-${fnv1a(key)}${djb2(key)}`
}

/** A deck id is content-derived iff it matches what its own cards hash to. */
export function isContentId(id: string, cards: ReadonlyArray<{ id: string }>): boolean {
  return id === deckIdFromCards(cards)
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    // 32-bit FNV prime multiply via shifts to stay in 32-bit integer math.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
