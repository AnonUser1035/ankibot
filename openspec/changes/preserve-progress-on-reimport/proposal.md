## Why

Re-importing a deck silently destroys the learner's progress. Import always builds a fresh `Deck` with every card at `newReviewState` (box 0, reps 0) and empty coaching, then `persistDeck` does an unconditional `put(serialize(deck), deck.id)` that overwrites any studied deck stored under the same id. Because the card *content* is re-derived identically from the `.apkg`, the cards look "remembered" while their SRS scheduling and coaching memory are reset — the exact reported symptom: "cards are remembered, but they show up as new progress." This is the most-traveled path, since importing the `.apkg` is the only obvious way a returning user re-opens their deck.

## What Changes

- Import becomes **non-destructive**: when an imported deck matches a deck already saved in this browser, existing per-card `reviewState` and `coaching` are carried forward onto the freshly-imported cards instead of being reset.
- Progress is matched by **stable card identity** (`id = guid:ord`), not by array position, so the merge also survives deck *updates* — added cards start fresh, removed cards drop out, unchanged cards keep their history.
- **Deck identity** stops being the raw filename. A deck gets a stable id derived from its content so the same deck re-imported under a different filename still resolves to the same saved record.
- A pure, unit-testable `mergeProgress(existing, imported)` function owns the carry-forward rule; `App.onImported` consults storage before persisting.
- **BREAKING** (storage-only, no user data loss): the deck id derivation changes. A one-time migration maps the legacy filename-keyed record to the new content id on first load so existing saved progress is preserved.

## Capabilities

### New Capabilities
- `deck-progress-continuity`: defines how SRS review state and coaching memory persist across re-imports and deck updates, including deck identity, card-level matching, and the merge rules for added/removed/unchanged cards.

### Modified Capabilities
<!-- None: openspec/specs/ currently has no committed specs for import or persistence. -->

## Impact

- `src/lib/importApkg.ts` — deck id derivation (content-based, not filename).
- `src/lib/storage.ts` — lookup of an existing saved deck by id; one-time legacy-key migration.
- New `src/lib/mergeProgress.ts` (+ tests) — pure carry-forward of `reviewState`/`coaching` by card id.
- `src/App.tsx` — `onImported` reads existing deck and merges before `autosave`.
- No change to the `SaveFile` schema or the SRS/coaching engines themselves.
