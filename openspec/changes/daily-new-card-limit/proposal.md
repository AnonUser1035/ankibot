## Why

The "20 cards" the app offers was a per-*session* batch size (`newCardsPerSession`), not a per-*day* limit. Nothing tracked how many new cards had been introduced today, so finishing a batch of 20 immediately surfaced the next 20, and a reload of a deck with more than 20 unlearned cards always showed "Study 20 now." Learners read this as a broken daily quota. Card due dates and the Leitner scheduler already work; what was missing was day-aware pacing of *new* cards.

## What Changes

- The new-card cap is now a **hard daily limit** (default 20/day): once that many new cards are introduced on a given local day, no further new cards are served until the next day. Due reviews still appear normally.
- A per-deck **daily ledger** (`dailyNew: { day, introduced }`) records introductions for the current local day and resets implicitly when the day rolls over.
- A new card counts against the budget the first time it is studied (correct or incorrect), captured in the answer flow.
- The deck screen reflects the cap honestly: it shows `N new · M reviews due`, gates the Study button on what's actually studyable, and shows a "you've studied today's N new cards — back tomorrow" state when the cap is reached.
- **BREAKING** (config): `SrsConfig.newCardsPerSession` is renamed to `newCardsPerDay`.
- Save format **v3**: adds the optional `dailyNew` ledger. Purely additive — older saves read as "none introduced today", so no migration step is needed.

## Capabilities

### New Capabilities
- `daily-new-card-limit`: defines the daily new-card budget, the per-deck ledger and its day-rollover semantics, when an introduction is counted, and how the deck screen presents the cap.

### Modified Capabilities
<!-- None committed in openspec/specs/ yet. -->

## Impact

- `src/types/deck.ts` — `DailyNew` type + optional `Deck.dailyNew`.
- `src/lib/srs.ts` — `startOfLocalDay`, `newIntroducedToday`, `newRemainingToday`, `recordNewIntroductions`; `buildSession` honors the budget; config field renamed.
- `src/lib/saveFile.ts` — parse/persist `dailyNew`; `SAVE_FORMAT_VERSION` → 3.
- `src/App.tsx` — `onAnswer` bumps the ledger when a new card is first studied.
- `src/components/DeckView.tsx` — counts, CTA gating, and the cap-reached state.
- Tests: `srs.test.ts` (cap + ledger), `saveFile.test.ts` (v3 round-trip).
