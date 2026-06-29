# Tasks

## 1. Data model
- [x] 1.1 Add `DailyNew` type and optional `Deck.dailyNew` in `src/types/deck.ts`.

## 2. Scheduler
- [x] 2.1 Add `startOfLocalDay`, `newIntroducedToday`, `newRemainingToday`, `recordNewIntroductions` to `src/lib/srs.ts`.
- [x] 2.2 `buildSession` caps new cards at `newRemainingToday` (applies in study-ahead too).
- [x] 2.3 Rename `SrsConfig.newCardsPerSession` → `newCardsPerDay` (default 20).
- [x] 2.4 Tests: cap spent / partially spent / day-rollover reset; ledger record + accumulate + rollover + no-op + clamp.

## 3. Persistence
- [x] 3.1 Parse `dailyNew` in `src/lib/saveFile.ts` (`parseDailyNew`, tolerant of malformed) and bump `SAVE_FORMAT_VERSION` → 3.
- [x] 3.2 Tests: v3 round-trip, pre-ledger save → undefined, malformed ledger → undefined.

## 4. Answer flow
- [x] 4.1 In `src/App.tsx` `onAnswer`, capture `wasNew` before `applyAnswer` and call `recordNewIntroductions` when true; chat undo reverts it via the existing snapshot.

## 5. Deck screen
- [x] 5.1 In `src/components/DeckView.tsx`, show `N new · M reviews due`, gate the Study button on `sessionSize`, and render the "today's N new cards done — back tomorrow" state when the cap is reached.

## 6. Verify
- [x] 6.1 `npm test` (89 passing), `npm run lint`, `tsc -b`, `vite build` — all clean.
- [ ] 6.2 Manual: study 20 new cards → confirm no more new cards offered, reviews still appear, reload keeps the cap, and it resets the next day. (For Ryan to run in-browser.)
