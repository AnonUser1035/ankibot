# Spec — Phase 8: Two Modes + the Examiner

**Status:** Draft for review
**Author:** Ryan (with Claude)
**Date:** 2026-06-29

---

## 1. Motivation

Today the app has exactly one study surface: a card-by-card flashcard flow with an
AI tutor (`claude-haiku-4-5`) **glued underneath every card**. The tutor's system
prompt tells it to "work through ONE flashcard at a time," "pose the question or
offer a quick way in," and never quiz — so in practice it just *reads the card to
you*. There is no way to turn the chat off, and no way to have a real conversation
that probes what you actually know.

This phase does three things:

1. **Separates flashcards and chat into two switchable modes** over the same deck
   and the same scheduler.
2. **Turns the chat into an active examiner** — it drives, quizzes, judges whether
   you know each word, and adapts — instead of reading cards to you.
3. **Unifies assessment**: what you prove (or fail to prove) in chat updates the
   spaced-repetition schedule, exactly like pressing *Got it* / *Missed it*.

It also **replaces the bundled sample deck** with *A Frequency Dictionary of
Spanish* (1000 cards, ranked by frequency).

### Locked decisions (from product discussion)

| Question | Decision |
| --- | --- |
| What does Chat mode do? | **Active examiner** — it picks words from the deck, quizzes (recognition + production), adapts difficulty, and judges mastery. |
| Does chat assessment feed the SRS? | **Yes, unified** — chat verdicts advance/lapse Leitner boxes just like manual grading. |
| Model | **Stay on Haiku** (`claude-haiku-4-5`). Fix the weakness with a rewritten "examiner" prompt and the orchestration below — not a model upgrade. Revisit if quality lags. |
| Default deck | **Replace** the bundled sample with the Spanish frequency deck. |

---

## 2. Current architecture (what we're building on)

- **Client-side React SPA.** All learner data lives in browser IndexedDB
  (`src/lib/storage.ts`). No server-side per-user state.
- **Stateless Worker** (`worker/src/index.ts`) only proxies the Anthropic key and
  enforces a monthly spend cap + per-IP rate limit. Model allowlist currently
  `{claude-haiku-4-5-20251001, claude-haiku-4-5}`; `MAX_TOKENS = 1024`.
- **The `tutor.ts` seam** (`src/lib/tutor.ts`) is the only frontend module that
  knows a model exists. It builds the system prompt, calls the Worker (or the
  user's own key), streams prose, and parses a hidden **verdict tail**
  (`<<<ANKIBOT_VERDICT>>>{json}`) into `{verdict, suggestedRating, memoryNote}`.
- **The SRS is deterministic and client-owned** (`src/lib/srs.ts`, Leitner 6-box).
  Core safety invariant: **the AI never mutates scheduling — only a human action
  does.** The verdict is currently only a *suggestion* that pre-selects a button.
- **State machine** (`src/App.tsx`): `landing → deck view → study session → summary`.
- **Cards** (`src/types/deck.ts`) carry `fields: Record<string,string>` (all named
  Anki fields), derived `front`/`back` plaintext, `reviewState`, and optional
  `coaching` memory.

### The new deck's shape

`_A_Frequency_Dictionary_of_Spanish_v2.apkg` — 1000 notes, note type 0 (Basic, not
cloze), ~220 KB, essentially no media. Fields per note:

| Field | Example |
| --- | --- |
| Rank | `5` |
| Word | `en` |
| Part-of-Speech | `prep` |
| Definition | `in, on` |
| Spanish | `vivo en el segundo piso` (example sentence) |
| English | `I live on the second floor` (sentence translation) |
| Freq | `496295` |

The current importer renders `front`/`back` from the Anki template, collapsing this
richness. **The examiner should consume `card.fields` directly** so it can test in
multiple directions (EN→ES production, ES→EN recognition, cloze on the example
sentence) rather than just front/back.

---

## 3. The two modes

Both modes operate over the **same deck and the same scheduler.** They are two
surfaces over one source of truth, freely switchable. A deck-level toggle chooses
which surface you enter; switching mid-session is allowed (the queue/position carry
over where it makes sense — see §6).

### 3.1 Flashcards mode (evolution of today's `Study`)

- Pure flashcards: prompt → *Show answer* → *Got it* / *Missed it*. Keyboard
  shortcuts unchanged (space / 1 / 2).
- **The embedded per-card chat is removed from this mode.** Conversation now lives
  in Chat mode. (Flashcards mode stays fast, quiet, and offline-friendly — it
  doesn't need the model at all.)
  - *Open option:* keep a collapsible "Ask the tutor" helper here, defaulting
    closed. Recommendation: **drop it** to keep the separation clean; re-add later
    if missed.
- Manual grading still drives SRS exactly as today.

### 3.2 Chat mode (new — the Examiner)

A continuous conversation in which **the examiner drives**:

1. The client puts a **target card** "on the table" (chosen by the scheduler — see
   §4).
2. The examiner quizzes on that card's word — choosing an angle (translate to
   Spanish, translate to English, use it in a sentence, fill the blank in the
   example sentence, etc.), adapting to the learner.
3. It reacts: affirms + sharpens when close, hints before revealing when off.
4. When the learner has been **demonstrably assessed** on the target, the examiner
   emits a verdict (reusing the existing tail mechanism, extended — see §5) and
   signals it's ready to advance.
5. The client applies the verdict to the SRS + coaching, advances to the next
   target, and the conversation continues seamlessly.

The session ends on the same condition as flashcards (queue exhausted) and shows
the same summary.

**Why client-orchestrated (the client picks the card, not the model):** it keeps
the deterministic scheduler authoritative, makes every verdict cleanly attributable
to a specific card id, and guarantees coverage of the due queue. The model owns the
*conversation and judgment*; the client owns *what's being tested and how it's
scheduled*. This is a direct extension of the existing "AI advises, app schedules"
seam — not a new architecture.

---

## 4. Scheduling & session model

- Chat mode walks the **same session queue** as flashcards: `buildSession(deck, now,
  config)` (due cards + up to N new). No new scheduler.
- The client maintains a "current target card." The examiner is given that card's
  full `fields`. When a verdict for it arrives, the client:
  - maps `suggestedRating` → `Grade` (`got_it → correct`, `missed_it → incorrect`),
  - calls the existing `answerCurrent(...)` + `applyCoaching(...)` path,
  - persists via `persistDeck(...)`,
  - advances the queue and sets the next target.
- **Mastery definition (for unified scheduling):** *got it* = produced/recognized
  the target correctly **without** the answer being revealed; *missed it* = wrong,
  or needed the answer revealed. `partial → missed_it` (conservative), consistent
  with the existing mapping.

---

## 5. Assessment: extending the verdict, preserving the safety invariant

### 5.1 Verdict tail (extended)

Keep `<<<ANKIBOT_VERDICT>>>{json}`. Extend the JSON so the client can route it and
know when to advance:

```jsonc
{
  "cardId": "1613972336546:0",   // NEW: which target this verdict is for
  "verdict": "correct|partial|incorrect",
  "suggestedRating": "got_it|missed_it",
  "advance": true,               // NEW: examiner is done with this card, move on
  "memoryNote": "short note"|null
}
```

`ParsedVerdict` (`src/lib/tutor.ts`) and `parseTutorOutput` grow `cardId` and
`advance`. `cardId` is validated against the current target before any SRS write —
a mismatched or missing id means **no scheduling change** (see below).

### 5.2 Auto-apply, but reversible — and never silent

Unified scheduling means chat verdicts *do* write to the SRS (this is the change
from "suggestion only"). To stay faithful to the safety invariant, the write is:

- **Visible**: the chat shows a small inline marker when a card is graded ("Marked
  *got it* — `en` moves up"), with a one-tap **change/undo**.
- **Fail-safe**: if the verdict is absent, malformed, or its `cardId` doesn't match
  the current target, **the SRS is not touched.** The examiner re-prompts or the
  client surfaces a manual *Got it / Missed it* control for that card. The scheduler
  must never move on a guess.

This keeps the property that **bad/missing model output can never corrupt your
schedule** — it just falls back to manual, exactly as today.

### 5.3 New examiner system prompt

Replace the "warm reader" prompt with an examiner brief. Key shifts:

- **Role:** an active language examiner. You *test*, you don't recite. Never reveal
  the answer before the learner has attempted (or explicitly given up).
- **Drive:** open by quizzing on the target word — pick one angle (EN→ES, ES→EN,
  use-in-a-sentence, cloze the example sentence). Vary angles across cards.
- **Use the rich fields:** you're given Word, Part-of-Speech, Definition, the
  Spanish example sentence, and its English translation. Use the example sentence as
  live material.
- **Adapt:** escalate when they're solid (conjugate it, use it in context); hint and
  scaffold when they struggle; reveal + explain only after a genuine attempt.
- **Judge honestly:** got it only when produced/recognized correctly without the
  answer being shown.
- **Emit the verdict tail** (with `cardId` + `advance`) once the learner has been
  assessed on the current target; omit it otherwise. Same "never mention the line"
  rules as today.

Token budget: examiner turns are short Q&A; `MAX_TOKENS = 1024` should hold. Watch
the monthly cap in `worker/src/index.ts` since chat mode is more turns per minute
than flashcards.

---

## 6. UX & state-machine changes

- **`src/App.tsx`**: add a `mode: 'flashcards' | 'chat'` dimension to the active
  study session. Deck view gains a mode toggle ("Flashcards · Chat") next to the
  Study button. Switching mid-session keeps the same queue/position.
- **`src/components/Study.tsx`**: strip the embedded `<TutorChat>`; becomes pure
  flashcards.
- **New `src/components/ChatStudy.tsx`** (or repurpose `TutorChat`): the examiner
  surface — continuous conversation, current-target indicator, inline grade
  markers with undo, and the shared summary screen.
- **`src/lib/tutor.ts`**: add an `examine()` entry point (or a mode flag on
  `respond()`) that builds the examiner prompt, passes `card.fields`, and parses the
  extended verdict. The streaming/SSE plumbing is unchanged.
- **Analytics** (`src/lib/analytics.ts`): add `mode_switch`, `chat_card_assessed`,
  `chat_verdict_overridden`.

---

## 7. Swapping the default deck

- Replace `public/sample.apkg` with the Spanish deck (drop in the file; keep the
  `sample.apkg` filename so the fetch path in `App.tsx#onTrySample` is unchanged, or
  rename and update the path + `scripts/make-sample-deck.mjs` accordingly).
- Update landing copy in `src/App.tsx`: CTA → *"Start with the 1000 most common
  Spanish words"*; adjust the "basic text cards" description.
- The importer already handles this note type (type 0, single template, trivial
  `<i>` tags). **Verify** import on the real file: 1000 cards, 0 skipped, fields
  populated. Add a regression test fixture if practical.
- Note the size jump (tiny sample → 1000 cards / ~220 KB bundled). Acceptable; the
  20-new-cards/session default paces it fine.

---

## 8. Out of scope (this phase)

- Model upgrade (deferred; staying on Haiku).
- Free-form "ask anything" tutoring and open conversation practice (the chosen
  behavior is the examiner; these are future modes).
- Server-side per-user state / accounts (still all client-side IndexedDB).
- Audio / pronunciation, multi-deck management, deck picker UI.

---

## 9. Open questions for review

1. **Flashcards-mode helper:** drop the embedded chat entirely (recommended) or keep
   it as a collapsible, closed-by-default helper?
2. **Verdict application:** auto-apply with inline undo (recommended) vs. require a
   one-tap confirm before each chat grade writes to the SRS?
3. **Test direction default:** let the examiner choose the angle freely
   (recommended), or expose a learner preference (e.g., "mostly EN→ES production")?
4. **Mid-session mode switching:** worth supporting in v1, or ship modes as separate
   entry points first and add live switching later?

---

## 10. Rough implementation order

1. Swap the default deck + landing copy; verify import (smallest, independently
   shippable).
2. Add the `mode` dimension to `App.tsx` + deck-view toggle; split `Study.tsx` into
   pure flashcards.
3. Add `examine()` + the examiner prompt + extended verdict parsing in `tutor.ts`
   (with unit tests for the parser, mirroring the existing verdict tests).
4. Build `ChatStudy.tsx`: examiner conversation, current-target, auto-apply verdict
   → SRS via the existing `onAnswer` path, inline grade markers + undo, summary.
5. Fail-safe paths (malformed/mismatched verdict → manual fallback) + analytics.
