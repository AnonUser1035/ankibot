## Why

The examiner chat currently renders assistant text raw (`whitespace-pre-wrap`, no markdown parsing), while the model frequently emits `**bold**` and similar markup. The result is literal asterisks scattered through messages — visually noisy and unprofessional. The system prompt's only formatting guidance is a single vague line ("No markdown headings; short paragraphs, or a tiny list at most"), which neither curbs gratuitous bolding nor tells the model when emphasis is genuinely useful. We need both halves to agree: clear rules for *when* the examiner formats, and a renderer that displays that formatting cleanly.

## What Changes

- Replace the vague formatting line in the examiner system prompt (`tutor.ts`) with explicit, intentional formatting rules: a small allowed set (bold, italic, inline code, short lists), with concrete guidance on *when* each is appropriate (e.g. bold reserved for the key term under test or a revealed answer; italics for foreign-language items or example sentences; inline code for literal strings/symbols) and an explicit instruction to default to plain prose and use emphasis sparingly.
- Render the examiner's messages through a constrained inline markdown renderer in `ChatStudy.tsx` so the allowed subset (bold, italic, inline code, line breaks, simple lists) displays correctly instead of showing raw asterisks/underscores. Disallowed constructs (headings, links, images, raw HTML, code fences) are stripped or shown as plain text — never as raw markup and never as injected HTML.
- Keep the verdict-sentinel contract intact: formatting is applied only to the learner-facing prose, never to the `<<<ANKIBOT_VERDICT>>>` JSON line, which is still split off before display.
- Render formatting safely (no `dangerouslySetInnerHTML` of model output) to avoid introducing an XSS surface.

## Capabilities

### New Capabilities
- `chat-message-formatting`: Rules the examiner follows when authoring messages — the allowed emphasis vocabulary and the intentional, sparing conventions governing when to apply bold, italic, inline code, and lists.
- `chat-message-display`: How the chat UI renders examiner messages — the constrained markdown subset that is parsed and displayed, what is stripped, and the safety guarantees.

### Modified Capabilities
<!-- No existing specs in openspec/specs/; nothing to modify. -->

## Impact

- `src/lib/tutor.ts` — `systemPrompt()` (around line 221): formatting-guidance lines rewritten/expanded. Verdict-sentinel rules (lines 223-229) unchanged.
- `src/components/ChatStudy.tsx` — message rendering block (lines 301-316): assistant content routed through the constrained renderer instead of being printed raw.
- Possibly a small new rendering helper/component (e.g. `src/components/FormattedMessage.tsx` or a `renderMessage` util) plus minimal Tailwind styling for emphasis/lists.
- Dependencies: prefer a tiny purpose-built inline parser to avoid adding a markdown library; if a library is chosen, it must be lightweight and rendered without raw-HTML injection. Decision deferred to design.md.
- No backend/worker, API, or data-model changes; the verdict/scheduling pipeline is untouched.
