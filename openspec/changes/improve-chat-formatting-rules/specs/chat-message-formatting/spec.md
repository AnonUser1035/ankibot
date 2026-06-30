## ADDED Requirements

### Requirement: Constrained emphasis vocabulary

The examiner system prompt SHALL define a closed set of allowed formatting constructs: bold, italic, inline code, and short bulleted/numbered lists. The prompt SHALL explicitly forbid all other markdown constructs in learner-facing prose, including headings, links, images, blockquotes, tables, code fences, and horizontal rules.

#### Scenario: Allowed constructs enumerated

- **WHEN** the system prompt is constructed for a card
- **THEN** it lists bold, italic, inline code, and short lists as the only permitted formatting and names the forbidden constructs explicitly

#### Scenario: No headings or fences

- **WHEN** the examiner composes a learner-facing message
- **THEN** it does not emit markdown headings (`#`), code fences (```), tables, or horizontal rules

### Requirement: Plain prose is the default

The system prompt SHALL instruct the examiner to default to plain, unformatted prose and to apply emphasis only when it carries meaning, not for visual decoration. The prompt SHALL state that most messages need no formatting at all.

#### Scenario: Ordinary message uses no emphasis

- **WHEN** the examiner asks a routine question or gives encouragement with no term that needs to stand out
- **THEN** the message contains no bold, italic, or inline-code markup

#### Scenario: Guidance discourages gratuitous bolding

- **WHEN** the system prompt is constructed
- **THEN** it explicitly tells the model not to bold whole sentences or multiple words per message for emphasis, and to favor plain prose

### Requirement: Intentional use conventions per construct

The system prompt SHALL give concrete, distinct conventions for each allowed construct so the examiner applies them purposefully:
- Bold is reserved for the single key term under test or a revealed answer.
- Italic is for foreign-language items, example sentences, or a word being mentioned rather than used.
- Inline code is for literal strings, symbols, or characters that must be reproduced exactly.
- Lists are for genuinely enumerable items only, kept short.

#### Scenario: Bold marks the answer reveal

- **WHEN** the examiner reveals the correct answer after a genuine attempt
- **THEN** the answer term may be bolded, and no other words in the message are bolded

#### Scenario: Italic marks a foreign term

- **WHEN** the examiner references a foreign-language word or an example sentence
- **THEN** that item may be italicized rather than bolded

#### Scenario: Inline code marks an exact literal

- **WHEN** the learner must reproduce an exact symbol, character, or string
- **THEN** the examiner wraps that literal in inline code rather than bold or italic

### Requirement: Formatting confined to learner-facing prose

The formatting rules SHALL apply only to the conversational prose and SHALL NOT alter the verdict-sentinel contract. The `<<<ANKIBOT_VERDICT>>>` line MUST remain valid one-line JSON with no markdown and no code fences.

#### Scenario: Verdict line stays unformatted

- **WHEN** the examiner concludes a card and emits the verdict sentinel line
- **THEN** that line contains no markdown emphasis and remains parseable one-line JSON exactly as specified
