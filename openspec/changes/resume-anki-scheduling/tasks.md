# Tasks

## 1. Anki scheduling mapping
- [x] 1.1 Create pure `src/lib/ankiScheduling.ts` — `reviewStateFromAnki(sched, colCrt, now, config)` mapping type/queue/due/ivl/reps/lapses/mod → `ReviewState` (new when reps 0; interval→box; due from crt or epoch; safe fallback to "due now").
- [x] 1.2 Tests `src/lib/__tests__/ankiScheduling.test.ts`: new, mature review, learning/relearning, interval→box edges, negative ivl, missing crt, suspended, lapse clamp, mod→lastReviewed.

## 2. Importer wiring
- [x] 2.1 Read `col.crt` (`readCollectionCrt`) and the scheduling columns; map each card via `reviewStateFromAnki` (drop the unconditional `newReviewState`).
- [x] 2.2 Extend the test fixture builder with `crt` + card scheduling columns (defaulting to new so existing tests are unaffected) and add `buildStudiedApkg`.
- [x] 2.3 Import test: studied deck resumes (review card box/reps/lapses/due; relearning due; new card stays new).

## 3. Merge refinement
- [x] 3.1 `mergeProgress`: in-app study (reps > 0) wins; un-studied existing cards adopt the import's schedule; coaching always carried.
- [x] 3.2 Tests: un-studied existing adopts import schedule; in-app study still protected.

## 4. Progress view
- [x] 4.1 `DeckView`: compute learned / dueReviews / newToday / upcomingReviews / % started; render count chips + a thin progress bar; show "coming up <when>".

## 5. Verify
- [x] 5.1 `npm test` (104 passing), `npm run lint`, `tsc -b`, `vite build` — all clean.
- [ ] 5.2 Manual: import an .apkg studied in Anki → confirm mature cards arrive non-new with sensible boxes/due; deck screen shows the breakdown. (For Ryan to run in-browser.)
- [ ] 5.3 Manual: to recover Anki history on the already-imported deck, re-import the .apkg → confirm un-studied cards adopt the schedule while in-app-studied cards are kept. (For Ryan.)
