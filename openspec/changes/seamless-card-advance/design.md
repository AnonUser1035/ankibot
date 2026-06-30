## Context

The auto-advance loop already works: `ChatStudy.tsx` grades on a parsed verdict (`:165-170`) and a `useEffect` opens the next card the moment the queue advances (`:95-107`). The friction is upstream — the examiner often ends a turn with a social closer and omits the verdict, so the app has nothing to act on and the learner must type "next". This is a prompt-behavior problem, not a mechanics problem.

## Goals / Non-Goals

**Goals:**
- The examiner concludes (affirm + verdict) in a single turn once it is satisfied, so the next card opens with no learner prompting.
- Follow-ups still happen but slightly less often, and a successful follow-up ends the card immediately.
- Keep the no-conclude-on-greeting/clarifying-question safeguard.

**Non-Goals:**
- No mechanical auto-advance / safety net (see decision below).
- No change to the verdict JSON schema, `parseTutorOutput()`, the streaming protocol, or SRS scheduling.

## Decisions

**Decision 1 — Prompt-only fix.** Rewrite the conclusion and follow-up guidance in `systemPrompt()`; touch no code. The parsing and advance machinery already support same-turn conclusion, so the cheapest effective lever is the prompt.

**Decision 2 — No mechanical safety net.** Any net that advances without a model verdict must guess doneness (false positive skips a card mid-assessment) or guess a grade (corrupts the SRS). Both are worse than the friction they remove, and the manual Got it / Missed it buttons already provide a correct human fallback. Rejected.
- *Alternative considered:* a mandatory per-turn status line (`{"done":true|false}`) that makes "done but no verdict" structurally impossible. More robust but adds ~30 tokens/turn and churns the verdict contract; its extra reliability over a strong prompt is partly speculative. Deferred as the escalation path if the prompt fix proves flaky in real use.

## Risks / Trade-offs

- **Model still occasionally lingers despite the prompt** → Accept for now; the failure mode is unchanged from today (one extra "next"), and Decision 2's per-turn-status upgrade is the clean escalation if it recurs.
- **Premature conclusion (concludes before a real attempt)** → Mitigated by explicitly preserving the greeting/clarifying-question safeguard and keeping the "genuine attempt required" rule.
- **Fewer follow-ups slightly reduces depth of probing** → Intended trade for seamlessness; follow-ups are kept, just not the default.
