## 1. Prompt formatting rules (tutor.ts)

- [x] 1.1 Replace the single formatting line in `systemPrompt()` (≈ line 221 of `src/lib/tutor.ts`) with a concise "Formatting" block.
- [x] 1.2 In that block, define the allowed set (bold, italic, inline code, short lists) and explicitly forbid headings, links, images, blockquotes, tables, code fences, and horizontal rules.
- [x] 1.3 State that plain prose is the default and most messages need no formatting; explicitly forbid bolding whole sentences or multiple words per message.
- [x] 1.4 Add per-construct conventions: bold = key term under test or revealed answer; italic = foreign items / example sentences / mention-not-use; inline code = exact literals; lists = genuinely enumerable, kept short.
- [x] 1.5 Confirm the verdict-sentinel instructions (≈ lines 223-229) still require plain one-line JSON with no markdown/fences; adjust wording only if needed for consistency. (Unchanged — already correct.)

## 2. Message renderer (ChatStudy.tsx)

- [x] 2.1 Add a small renderer (`src/lib/markdownLite.ts` pure tokenizer + `src/components/FormattedMessage.tsx`) that tokenizes only the allowed subset and returns React elements (`<strong>`, `<em>`, `<code>`, line breaks, `<ul>/<ol>`) — never an HTML string, never `dangerouslySetInnerHTML`.
- [x] 2.2 Make the tokenizer lenient: treat unmatched/partial markers (e.g. streamed `**par`) as literal text and never throw; downgrade disallowed constructs (headings → plain text, fences dropped, links/etc. → literal text).
- [x] 2.3 Route assistant messages through the renderer in the message block; keep user messages as plain text. Dropped `whitespace-pre-wrap` from the assistant bubble so the renderer controls line breaks and lists.
- [x] 2.4 Add minimal Tailwind styling for emphasis, inline code, and list items consistent with the existing chat bubble styles (light/dark).
- [x] 2.5 Verify the verdict sentinel is already stripped before render. (Confirmed: `readSse()` in tutor.ts holds back/strips the sentinel during streaming, so the UI's `turn.content` is always clean prose.)

## 3. Tests & verification

- [x] 3.1 Add unit tests for the tokenizer: bold, italic (`*` and `_`), inline code, line breaks, short lists, unmatched/partial markers, and inline code containing `*`. (`src/lib/__tests__/markdownLite.test.ts`, 15 cases.)
- [x] 3.2 Add a test asserting tag-like text (`<script>`) is treated as literal text by the tokenizer; live-DOM safety is structural (React-element output, no `dangerouslySetInnerHTML`).
- [x] 3.3 Verdict-sentinel exclusion is covered by existing `parseTutorOutput`/`readSse` tests in `tutor.test.ts`; the sentinel never reaches the renderer's input, so no separate render test is needed.
- [ ] 3.4 Manually run the chat: confirm clean bold/italic/code rendering, no stray asterisks, and graceful streaming of partial markup. (Not done — requires a configured tutor worker/API key.)

## 4. Wrap-up

- [x] 4.1 Run `openspec validate improve-chat-formatting-rules` and the project lint/build to confirm everything passes. (119 tests pass, lint clean, build succeeds.)
