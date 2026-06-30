## ADDED Requirements

### Requirement: Render the allowed markdown subset

The chat UI SHALL render examiner messages through a renderer that displays the allowed subset — bold, italic, inline code, line breaks, and short bulleted/numbered lists — as styled elements rather than as literal markup characters.

#### Scenario: Bold renders as bold

- **WHEN** an examiner message contains `**term**`
- **THEN** the UI displays "term" in bold weight and no literal asterisks appear

#### Scenario: Italic renders as italic

- **WHEN** an examiner message contains `*word*` or `_word_`
- **THEN** the UI displays "word" in italics with no literal asterisks or underscores

#### Scenario: Inline code renders distinctly

- **WHEN** an examiner message contains `` `literal` ``
- **THEN** the UI displays "literal" in a monospace/inline-code style with no literal backticks

#### Scenario: Line breaks preserved

- **WHEN** an examiner message contains multiple lines or a short list
- **THEN** the UI preserves the line breaks and renders list items as a list

### Requirement: Disallowed constructs never render as raw markup or HTML

The renderer SHALL NOT display unsupported markdown as raw markup characters, and SHALL NOT inject model output as raw HTML. Unsupported constructs (headings, links, images, blockquotes, tables, code fences, raw HTML) SHALL be downgraded to plain text or stripped.

#### Scenario: No literal asterisks for unmatched markup

- **WHEN** a message contains a stray or unmatched `*` that is not valid emphasis
- **THEN** it is shown as a literal asterisk character, not as broken markup, and never breaks rendering

#### Scenario: HTML in model output is not executed

- **WHEN** an examiner message contains an HTML tag or `<script>` fragment
- **THEN** the renderer escapes or strips it and never injects it as live DOM (no `dangerouslySetInnerHTML` of model text)

#### Scenario: Heading markup downgraded

- **WHEN** a message contains `# Heading`-style markup
- **THEN** it is rendered as plain text, not as an HTML heading

### Requirement: Streaming-safe rendering

The renderer SHALL handle partial/streamed content gracefully, displaying incomplete markup without crashing or flashing broken output while tokens arrive.

#### Scenario: Partial bold during streaming

- **WHEN** a streamed message has so far produced `**par` (closing `**` not yet arrived)
- **THEN** the UI renders the partial text without throwing and resolves to bold once the closing marker arrives

### Requirement: User and assistant messages styled consistently

Only assistant (examiner) messages require markdown rendering; user messages MAY continue to render as plain text. Whichever path is used, the verdict-sentinel line MUST already be stripped before rendering so it is never shown to the learner.

#### Scenario: Verdict line not displayed

- **WHEN** a raw assistant message contains the `<<<ANKIBOT_VERDICT>>>` line
- **THEN** the rendered output shown to the learner contains neither the sentinel nor its JSON
