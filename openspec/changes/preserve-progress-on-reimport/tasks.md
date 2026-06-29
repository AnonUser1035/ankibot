# Tasks

## 1. Stable deck identity
- [x] 1.1 Add a content-based deck id derivation (stable hash over sorted card ids) in `src/lib/deckId.ts`; set `deck.id` from it in `src/lib/importApkg.ts` while keeping `deck.name` from the filename.
- [x] 1.2 Unit test (`src/lib/__tests__/deckId.test.ts`): same card set → same id regardless of card order or filename; different membership → different id.

## 2. Pure merge function
- [x] 2.1 Create `src/lib/mergeProgress.ts` exporting `mergeProgress(existing: Deck, imported: Deck): Deck` — content from `imported`, `reviewState` + `coaching` carried from `existing` by card `id`; unmatched imported cards stay fresh; cards only in `existing` are dropped.
- [x] 2.2 Tests in `src/lib/__tests__/mergeProgress.test.ts`: order-independent match, added cards start fresh, removed cards dropped, edited content kept with carried progress, empty `existing` is a no-op, immutability, coaching fallback.

## 3. Wire merge into import
- [x] 3.1 In `src/App.tsx` `onImported`, look up an existing saved deck by the imported deck's id; if found, use `mergeProgress(existing, result.deck)` as the active deck.
- [x] 3.2 Ensure the merged deck (not the raw import) is what `setDeck`/`autosave`/`track` receive.

## 4. Storage lookup + legacy migration
- [x] 4.1 Add a `getDeck(id)` read to `src/lib/storage.ts` for the `onImported` lookup (null on miss/error, never throws).
- [x] 4.2 On boot in `loadActiveDeck`, if the active record is keyed by a legacy filename id, re-key it to the content id, repoint `activeDeckId`, and delete the stale key — best-effort, never blocks boot.
- [ ] 4.3 Test the migration path in storage. SKIPPED: requires `fake-indexeddb` (not a dependency); jsdom has no IndexedDB. Covered indirectly by `deckId` tests + manual verification 5.1/5.2. Add the dep + test if storage gains more logic.

## 5. Verify end-to-end
- [x] 5.3 Ran `npm test` (77 passing), `npm run lint` (clean), `tsc -b` + `vite build` (clean). The `mergeProgress` "carries review state and coaching forward" test is the regression guard for the original bug.
- [ ] 5.1 Manual: import sample → study some cards → re-import same `.apkg` → confirm boxes/coaching unchanged and no card shows as new. (For Ryan to run in-browser.)
- [ ] 5.2 Manual: re-import same deck from a renamed file → confirm progress preserved. (For Ryan to run in-browser.)
