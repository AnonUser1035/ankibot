## 1. Prompt: conclusion behavior (tutor.ts)

- [x] 1.1 Rewrite the conclusion guidance in `systemPrompt()` so that once the examiner is satisfied, it affirms AND emits the verdict line in the same turn.
- [x] 1.2 Add an explicit instruction never to ask permission to advance or end a turn with "ready for the next one?" — the app handles transitions.
- [x] 1.3 Tune the follow-up line (≈ `:216`) so follow-ups are a bit less frequent and explicitly terminal: one successful follow-up → conclude immediately.
- [x] 1.4 Preserve the safeguard (≈ `:235`): do NOT conclude on greetings, clarifying questions, or before a genuine attempt. (Unchanged — kept intact.)

## 2. Verify

- [x] 2.1 Run the test suite, lint, and build to confirm nothing regressed. (119 tests pass, lint clean, build succeeds.)
- [x] 2.2 Run `openspec validate seamless-card-advance`.
