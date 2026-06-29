## Why

Two related complaints from a deck with a handful of studied cards reading as "1000 new, 20 due today":
1. The importer reset **every** card to new, discarding any study already done in Anki — a deck studied for months imported as if untouched.
2. Even cards studied in-app became invisible: once scheduled into the future they dropped out of the deck screen's counts, so progress looked lost.

Neither was a scheduling-math bug (the Leitner engine computes correct due dates). The gaps were in **import fidelity** and **progress display**.

## What Changes

- On import, read Anki's native scheduling from the `cards` table (`type`, `queue`, `due`, `ivl`, `reps`, `lapses`, `mod`) plus `col.crt`, and map it onto our `ReviewState` so already-studied cards **resume** (interval → Leitner box, Anki due → our due, reps/lapses preserved). Never-studied cards stay new. Faithfully reimplemented, not copied (Anki is AGPL).
- The deck screen shows a **progress breakdown** — due now / new today / learning / coming up (with the next due time) — plus a "% started" bar, so studied-but-not-due cards stay visible instead of vanishing into the total.
- **Merge refinement** (extends `preserve-progress-on-reimport`): on re-import, in-app study (reps > 0) still wins, but a card not yet studied in-app adopts the import's schedule — so re-importing a deck can pick up Anki history without clobbering reviewed cards.

## Capabilities

### New Capabilities
- `anki-scheduling-import`: how Anki's per-card scheduling is mapped onto our review state at import time.
- `deck-progress-view`: what the deck screen surfaces so a learner can see their progress at a glance.

### Modified Capabilities
- `deck-progress-continuity`: the re-import merge now prefers the import's schedule for cards not yet studied in-app (was: always keep existing).

## Impact

- New `src/lib/ankiScheduling.ts` (+ tests) — pure Anki→`ReviewState` mapping.
- `src/lib/importApkg.ts` — read `col.crt` + scheduling columns; map per card (drops the unconditional `newReviewState`).
- `src/lib/mergeProgress.ts` — in-app study wins; unstudied cards adopt the import.
- `src/components/DeckView.tsx` — progress breakdown chips + bar.
- Tests/fixtures: `ankiScheduling.test.ts`, studied-deck fixture + import test, merge tests.
