## Context

The persistence chain is already sound: one versioned serializer stores the full `reviewState` and `coaching` per card, and boot restores it faithfully. The defect is not in storage — it is that **import always produces new-card state and persistence overwrites by a fragile key**, so the only natural "re-open my deck" action wipes progress.

Two identity concepts exist today; the robust one is unused on import:

| Identity | Source | Stability |
|---|---|---|
| Deck id | `deckNameFromFileName` (the filename) | fragile — renames/dupes collide |
| Card id | `${note.guid}:${ord}` | **stable across re-exports** — already computed, never consulted on import |

The card guid is stable across Anki exports of the same note, so the data needed to carry progress forward already exists in every import.

## Goals / Non-Goals

**Goals**
- Re-importing a deck never resets progress for cards the learner has already seen.
- Merge survives deck *updates* (added/removed/edited cards) by matching on card identity.
- Existing filename-keyed saves upgrade without data loss.

**Non-Goals**
- A multi-deck library / deck switcher UI (worth doing later; not required to stop the data loss).
- Any change to the SRS or coaching engines, or to the `SaveFile` schema.
- Cross-browser / cloud sync. This remains browser-local.

## Decisions

### Decision: Carry progress forward with a pure `mergeProgress(existing, imported)`
The merge is a pure function over two `Deck`s returning a new `Deck`: take the imported deck's card *content* as the source of truth, and for each imported card, if `existing` has a card with the same `id`, copy that card's `reviewState` and `coaching` onto it; otherwise leave the fresh new-card state. Cards only in `existing` are dropped (they're no longer in the deck).

- **Why a separate pure module:** the App orchestration is the one untested seam today and the exact spot the regression lives. A pure `mergeProgress` is trivially unit-testable (order-independence, added/removed cards, edited content) and keeps `App.tsx` thin.
- **Alternatives considered:** matching by front/back text (breaks on edits and on duplicate fronts); merging inside `persistDeck` (couples storage to deck semantics and hides the rule); prompting the user on every re-import (annoying for the common case — preserve silently, it's never the wrong default).

### Decision: Content-derived deck id
Derive `deck.id` from a stable function of the sorted card ids (e.g. a hash) rather than the filename. This makes "same deck, renamed file" resolve to the same saved record, which is what makes `mergeProgress` reliably find the prior deck. `deck.name` can still come from the filename for display.

- **Alternative:** use Anki's own deck/collection id from the collection DB. Rejected for v1 — it's available but more coupling to Anki internals than needed, and a card-id hash is sufficient and self-contained. Worth revisiting if collisions ever surface.

### Decision: One-time legacy migration on load
Because the id derivation changes, an existing filename-keyed record won't be found by the new content id. On boot, if a content-id lookup misses but a legacy filename-keyed record exists for the active deck, re-key it to the content id (and update `activeDeckId`). This runs through the existing serializer, so no schema bump is needed.

## Risks / Trade-offs

- **Hash collisions across genuinely different decks** → two decks merge into one. Mitigation: hash over the full sorted card-id set, which differs whenever membership differs; collision probability is negligible. The card-level merge is still keyed by exact card id, so even a deck-id collision can't fabricate progress for a non-matching card.
- **A learner who *wants* a clean slate** → re-import won't reset. Mitigation: "Clear saved data" already exists for that intent; a future "start over" affordance can be added if asked for.
- **Migration only covers the active deck** → orphaned non-active legacy records stay filename-keyed until next imported. Acceptable: they're already unreachable in the current single-active-deck UI, and re-import will rebuild them correctly.

## Migration Plan

1. Ship `mergeProgress` + content-id derivation behind the import path.
2. On first boot after deploy, `loadActiveDeck` detects a legacy filename-keyed active record, re-serializes it under the content id, repoints `activeDeckId`, and removes the stale key.
3. No user action required; exported `.json` backups are unaffected (they round-trip through the same serializer).

## Open Questions

- Should deck identity use Anki's native deck id instead of a card-id hash? (Deferred — card-id hash is sufficient for v1.)
- Do we eventually want a deck library so re-import is no longer the only entry point? (Out of scope here; this change makes re-import *safe* regardless.)
