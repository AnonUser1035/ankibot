## Context

The examiner chat has two cooperating layers that currently disagree:

- **Authoring** — `systemPrompt()` in `src/lib/tutor.ts` builds the instructions sent to `claude-haiku-4-5`. Its only formatting guidance is one line (≈ line 221): *"Be encouraging but brief. No markdown headings; short paragraphs, or a tiny list at most."* This neither defines an emphasis vocabulary nor discourages reflexive bolding, so the model frequently emits `**…**`.
- **Display** — `ChatStudy.tsx` (message block, lines 301-316) renders `turn.content` raw inside a `whitespace-pre-wrap` div. There is no markdown parser anywhere in the project (`package.json` has none), so emitted markup shows up as literal asterisks/underscores.

The verdict pipeline is independent and must stay so: `VERDICT_SENTINEL` (`<<<ANKIBOT_VERDICT>>>`) is split off by `parseTutorOutput()` (≈ lines 265-307) before content reaches the UI; formatting must never touch that JSON line.

Stack: React 19 + TypeScript + Vite + Tailwind 4. The project has deliberately stayed dependency-light.

## Goals / Non-Goals

**Goals:**
- Make the model use emphasis intentionally and sparingly via explicit, per-construct prompt rules.
- Render the allowed subset (bold, italic, inline code, line breaks, short lists) cleanly — no stray asterisks.
- Render safely: no raw-HTML injection of model output.
- Keep the verdict-sentinel contract and scheduling pipeline untouched.

**Non-Goals:**
- Full CommonMark/GFM support (links, images, tables, blockquotes, code fences, headings) — explicitly excluded and downgraded to plain text.
- Rendering or restyling user-typed messages (they may stay plain text).
- Changing the model, streaming protocol, or verdict format.

## Decisions

**Decision 1 — Tiny custom inline renderer over a markdown library.**
Render assistant content with a small, purpose-built React renderer (a `FormattedMessage` component or `renderMessage()` util) that tokenizes only the allowed subset and returns React elements (`<strong>`, `<em>`, `<code>`, `<br>`, `<ul>/<ol>`). 
- *Why:* The needed subset is tiny, the project avoids dependencies, and returning React elements (never an HTML string) makes XSS structurally impossible. A full library (`react-markdown` + `remark`) would add weight and still need configuration to disable the disallowed constructs.
- *Alternative considered:* `react-markdown` with an allowlist of components. Rejected for dependency weight and because we'd still restrict it to roughly this subset. Revisit only if requirements grow toward full markdown.

**Decision 2 — Safe-by-construction rendering, never `dangerouslySetInnerHTML`.**
The renderer emits React nodes; any tag-like text in model output is treated as literal text. This preserves the project's current property of having zero `dangerouslySetInnerHTML` usage.

**Decision 3 — Lenient tokenizer (no throw on partial/unmatched markup).**
Because content streams token-by-token, the tokenizer treats unmatched/partial markers (`**par` with no closing `**`) as literal text until completed, and never throws. This satisfies the streaming-safe requirement and avoids flashing broken output.

**Decision 4 — Prompt rules expressed as a short, concrete block.**
Replace the single line in `systemPrompt()` with a compact "Formatting" block: default to plain prose; bold only the key term under test or a revealed answer; italics for foreign items / example sentences / mention-not-use; inline code for exact literals; short lists only when enumerable; never bold whole sentences or multiple words for emphasis; the verdict line stays plain JSON.
- *Why:* Concrete per-construct conventions curb gratuitous bolding far better than a blanket "no markdown" ban, while still allowing meaningful emphasis. Kept short to avoid bloating the prompt for a small/fast model.

**Decision 5 — Strip the verdict before rendering (unchanged boundary).**
The renderer operates only on the already-cleaned prose produced by `parseTutorOutput()`. The sentinel split stays exactly where it is; the renderer never sees the JSON line.

## Risks / Trade-offs

- **Custom parser has edge cases** (nested emphasis, adjacent markers) → Keep the grammar minimal, prefer literal fallback over clever parsing, and cover edge cases (unmatched markers, mixed `*`/`_`, inline code containing `*`) with unit tests.
- **Model still over-formats despite rules** → Renderer degrades gracefully (sparse bold just renders as bold); prompt rules reduce frequency. If still noisy, a future option is a render-side cap (e.g. ignore bold spanning a whole line), deferred unless needed.
- **Streaming partial markup flicker** → Lenient tokenizer renders partials as literal text and resolves on completion; acceptable and non-breaking.
- **Subtle behavior change for users** who were used to seeing raw asterisks → This is the intended fix; no migration needed.

## Migration Plan

Purely additive and internal — no data, API, or schema changes. Ship prompt change and renderer together so rules and display stay in sync. Rollback is reverting the two edited files (`tutor.ts`, `ChatStudy.tsx`) plus any new helper file; no persisted state is affected.

## Open Questions

- Should inline code be visually styled with a subtle background (Tailwind) or just monospace? (Cosmetic; resolve during implementation.)
- Do user messages ever contain markup worth rendering? Assumed no for now — user messages stay plain text.
