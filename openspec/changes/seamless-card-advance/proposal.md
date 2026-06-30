## Why

When the examiner finishes assessing a card it frequently ends its turn with a social closer ("Nice work! Ready for the next one?") instead of emitting the verdict sentinel. The app advances the queue *only* on a verdict, so the learner has to type "next" to nudge it — one wasted round trip per card. The auto-advance mechanics already work (`ChatStudy.tsx` grades on a verdict and the next card opens automatically); the gap is purely that the model treats "move on" as a social negotiation and delays the verdict.

## What Changes

- Rewrite the conclusion rules in the examiner system prompt (`tutor.ts`) so that the moment the examiner is satisfied the learner knows the card, it affirms in one breath AND emits the verdict line in the **same** turn — it never asks permission to advance or ends a turn with "ready for the next one?".
- Tune the follow-up guidance so follow-ups still happen but a bit less often, and are explicitly terminal: one successful follow-up → conclude immediately.
- Preserve the existing safeguard: do NOT conclude when the learner only greeted, asked a clarifying question, or has not yet made a genuine attempt.
- No mechanical/auto-advance safety net is added — advancing without a model verdict would require guessing doneness (risks skipping a card mid-assessment) or guessing a grade (corrupts SRS). The existing manual Got it / Missed it buttons remain the human fallback.

## Capabilities

### New Capabilities
- `examiner-conclusion`: When and how the examiner concludes a card and signals the app to advance — conclude-in-the-same-turn behavior, no permission-seeking, follow-up cadence, and the non-conclusion safeguards.

### Modified Capabilities
<!-- No archived specs in openspec/specs/ yet; nothing to modify. -->

## Impact

- `src/lib/tutor.ts` — `systemPrompt()` conclusion/follow-up guidance (≈ lines 216, 223-229) rewritten. The verdict-sentinel JSON contract and `parseTutorOutput()` are unchanged.
- No changes to `ChatStudy.tsx`, the streaming protocol, the verdict schema, or SRS scheduling — this is a prompt-behavior change only.
