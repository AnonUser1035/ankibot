## Context

A user with a few studied cards saw "1000 cards · 20 new · 0 due". Reproduced in a simulation: the logic was correct (studied cards were scheduled into the future, today's new budget legitimately reset), but two real gaps made it feel broken — the importer discarded Anki's study history, and the deck screen hid learned-but-not-due cards.

On "rip Anki's code": Anki is **AGPL-3.0**. Copying its code would force this app to AGPL with a network-source-disclosure obligation, and its Rust v3/FSRS scheduler isn't droppable into a browser app. Algorithms aren't copyrightable, so we reimplement the encoding ourselves. Our Leitner scheduler is unchanged — this is import fidelity + display, not scheduling math.

## Goals / Non-Goals

**Goals**
- A deck studied in Anki resumes (maturity, due, reps, lapses) instead of resetting to new.
- Progress is visible at a glance on the deck screen.
- Re-import can pick up Anki history for un-studied cards without harming in-app study.

**Non-Goals**
- Bit-exact parity with Anki's scheduler (filtered decks, FSRS params, learning steps, suspension/burying state).
- Importing Anki review *logs* (`revlog`) — only the current per-card state.
- Changing our Leitner intervals or the daily-new-card cap.

## Decisions

### Decision: Pragmatic Anki→ReviewState mapping in a pure module
`reviewStateFromAnki(sched, colCrt, now, config)` lives in `src/lib/ankiScheduling.ts`, pure and fully unit-tested. Mapping rules:
- reps ≤ 0 or type new → fresh new card.
- interval → box: highest box whose interval ≤ Anki ivl (days), clamped to [1, maxBox]; negative ivl is `-seconds` → days.
- due: review cards store days-since-`col.crt` → `(crt + due*86400)*1000`; learning/relearning store an epoch-seconds timestamp → `due*1000`. A `due` above a timestamp threshold is treated as epoch seconds, below as a day offset.
- reps/lapses preserved; `lastReviewed = mod*1000` (Anki `mod` is seconds) or null.
- Unknown encodings / missing crt → due now (degrade safely, never throw).

**Why pragmatic, not exact:** "resume where I left off" needs maturity + due + counts, which this preserves. Anki's full encoding has edge cases (filtered decks, v1/v2/v3 differences) not worth porting for a browser study app; they fall back to "due now", which is harmless.

### Decision: Merge prefers the import for un-studied cards
Previously `mergeProgress` always kept the stored card, which would permanently block Anki history from reaching a deck imported before this feature. Now: `isNew(existing)` → take the import's schedule; else keep in-app progress. In-app study is never overwritten; coaching always carries forward.

### Decision: Display-only progress breakdown
`DeckView` computes `learned` (reps ≥ 1), `dueReviews`, `newToday`, `upcomingReviews`, and `% started` from the deck in memory — no new persisted state, no scheduler change. Rendered as count chips + a thin bar.

## Risks / Trade-offs

- **Anki due-encoding drift:** the days-vs-seconds heuristic could misread an exotic card; worst case it becomes "due now", not data loss. Bounded by the timestamp threshold and the crt branch.
- **Re-import adopting import schedule for un-studied cards:** if a user imported with Anki history, never studied a card in-app, then re-imports a *changed* export, that card re-adopts the new schedule. Intended — the import is the source of truth until you study in-app.
- **Suspended/buried cards:** imported using their review schedule (we have no suspend concept). Acceptable for v1.

## Migration Plan

Transparent. Fresh imports immediately resume Anki history. To pull Anki history into a deck imported *before* this change, the user re-imports the `.apkg`: in-app-studied cards are protected, un-studied cards adopt the Anki schedule. No data migration; save format unchanged.
