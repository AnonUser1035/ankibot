## ADDED Requirements

### Requirement: Conclude in the same turn as the final affirmation

When the examiner is satisfied that the learner knows the current card, it SHALL affirm the result and emit the verdict-sentinel line in the SAME message. It SHALL NOT split the conclusion across two turns (affirm now, verdict later).

#### Scenario: Correct answer concluded immediately

- **WHEN** the learner gives a correct answer and the examiner has no further probe to run
- **THEN** the examiner's reply both affirms the answer and ends with the verdict-sentinel line, so the app advances without further input

#### Scenario: No permission-seeking handoff

- **WHEN** the examiner has finished assessing a card
- **THEN** its message does not ask whether the learner is ready, does not say "ready for the next one?" or equivalent, and does not wait for a confirmation turn before emitting the verdict

### Requirement: Follow-ups are occasional and terminal

The examiner MAY pose at most one harder follow-up on the same card after a correct answer, but SHALL do so less often than as a default. Once a follow-up is answered successfully, the examiner SHALL conclude immediately in that same turn rather than chaining further follow-ups or asking to continue.

#### Scenario: Successful follow-up concludes the card

- **WHEN** the examiner posed one follow-up and the learner answered it correctly
- **THEN** the examiner affirms and emits the verdict line in that same turn, without posing another follow-up

#### Scenario: Follow-ups not posed every time

- **WHEN** a learner answers the initial question correctly
- **THEN** the examiner usually concludes directly and reserves follow-ups for cases where probing depth adds genuine value

### Requirement: Do not conclude without a genuine attempt

The examiner SHALL NOT emit the verdict line when the learner has only greeted it, asked a clarifying question, or otherwise not yet made a genuine attempt at the card. In those cases it continues the conversation and omits the verdict line.

#### Scenario: Greeting does not advance

- **WHEN** the learner only greets the examiner or asks a clarifying question
- **THEN** the examiner responds and omits the verdict line, so the card does not advance

#### Scenario: Mid-assessment keeps probing

- **WHEN** the examiner is still hinting, escalating, or awaiting a real attempt
- **THEN** it omits the verdict line and keeps the conversation going
