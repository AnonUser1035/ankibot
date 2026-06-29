## Context

Due dates and the Leitner engine already work; the gap was that `newCardsPerSession` capped a single session, with no memory of how many new cards had been seen "today." Any deck with >20 unlearned cards therefore re-offered 20 forever. The chosen behavior (confirmed with the user) is an **Anki-style hard cap**: 20 new/day, reviews unaffected, no "study more" escape hatch.

## Goals / Non-Goals

**Goals**
- New cards are paced by a real per-day budget that resets at local-day rollover.
- The budget survives reloads and is portable in exported saves.
- The deck screen tells the truth about what's studyable and why.

**Non-Goals**
- Configurable limit / per-deck overrides / rollover-hour setting (default 20, local midnight).
- A soft cap or "study extra new cards" affordance (explicitly declined).
- Touching review scheduling — reviews are never capped by this.

## Decisions

### Decision: Per-deck ledger on the Deck, persisted (save v3)
Store `dailyNew: { day, introduced }` on the `Deck`, where `day` is the local-midnight epoch ms. It lives on the deck (not global) so each deck paces independently, and it rides the existing serializer so it persists and exports for free.

- **Why local-midnight epoch as the key:** unambiguous, comparable, and derivable from the injected `now` via `new Date(now).setHours(0,0,0,0)` — the same `new Date(ms)` pattern `saveFile` already uses. Keeps `srs` deterministic given `now`.
- **Why additive (no migrate step):** an absent ledger is exactly the correct zero-state ("none introduced today"). v3 is bumped for honesty/forward-rejection, but `migrate()` needs no new branch. `parseDeck` must read `dailyNew` explicitly, since `deserialize` rebuilds the deck field-by-field and would otherwise drop it.

### Decision: Count the introduction in the answer flow, not the scheduler
`buildSession` is pure and read-only; it must not record state. The first grade of a new card (captured as `wasNew = reps === 0` before `applyAnswer`) is where `App.onAnswer` calls `recordNewIntroductions(deck, 1, now)`. Re-drilled misses within a session don't double-count because reps is already ≥1 the second time.

- **Chat undo:** `onChatAnswer` snapshots `{deck, session}` before grading, so undo restores the pre-increment ledger automatically — no special-casing.

### Decision: `buildSession` reads remaining budget; cap applies in study-ahead too
`newAllowance = newRemainingToday(deck, now, config)` replaces the flat slice. Study-ahead still respects the cap (consistent with "hard cap") — it surfaces not-yet-due *reviews* early, never extra new cards.

### Decision: Rename `newCardsPerSession` → `newCardsPerDay`
The semantics changed from per-session to per-day; the name must not lie. Single config field, one test reference updated.

## Risks / Trade-offs

- **Timezone / clock changes:** the day key is local-time-derived, so travel or DST can nudge the rollover by an hour. Acceptable for a personal study app; matches Anki's spirit without a configurable rollover hour.
- **"Study ahead" when only new cards remain:** with the cap reached and no due reviews, study-ahead may serve little or nothing. Acceptable — the cap is intentional; study-ahead is for reviews, not bypassing the new limit.
- **No per-deck configurability yet:** 20 is hardcoded in `DEFAULT_SRS_CONFIG`. Fine until a settings surface exists.

## Migration Plan

Ships transparently: existing saves lack `dailyNew` → read as zero today → full allowance available immediately, exactly as a fresh day. No user action; exported backups round-trip through the same serializer.
