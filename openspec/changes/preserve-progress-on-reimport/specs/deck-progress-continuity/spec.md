## ADDED Requirements

### Requirement: Re-import preserves existing progress

When a deck is imported and a previously-saved deck with the same deck identity already exists in this browser, the system SHALL carry each existing card's `reviewState` and `coaching` forward onto the matching freshly-imported card, rather than resetting it to new-card defaults.

#### Scenario: Same deck re-imported after study

- **WHEN** a learner has studied a deck (cards advanced past box 0, coaching notes recorded) and re-imports the same `.apkg`
- **THEN** every re-imported card whose identity matches a saved card retains its saved `box`, `due`, `reps`, `lapses`, `lastReviewed`, and `coaching`
- **AND** no card that was previously reviewed appears as new (`reps === 0`)

#### Scenario: First import of a never-seen deck

- **WHEN** a learner imports a deck for which no saved deck exists in this browser
- **THEN** every card is initialized with new-card review state and empty coaching, exactly as today

### Requirement: Progress is matched by stable card identity

The system SHALL match saved progress to imported cards by the stable card id (`note.guid` combined with the template ordinal), never by array position or by front/back text.

#### Scenario: Card order changed between exports

- **WHEN** the re-imported deck presents its cards in a different order than the saved deck
- **THEN** each card's progress still follows its own identity, not the position it now occupies

#### Scenario: Card content edited but identity unchanged

- **WHEN** a card's front or back text was edited in Anki but its note guid and ordinal are unchanged
- **THEN** the imported (edited) content is kept while the saved `reviewState` and `coaching` are carried forward

### Requirement: Merge handles added and removed cards

When the imported deck and the saved deck differ in membership, the system SHALL keep progress only for cards present in the import, start added cards fresh, and drop cards no longer present.

#### Scenario: Deck gained new cards

- **WHEN** the re-imported deck contains card identities absent from the saved deck
- **THEN** those new cards are initialized as new (box 0, reps 0, empty coaching)
- **AND** existing cards retain their saved progress

#### Scenario: Deck lost cards

- **WHEN** the saved deck contains card identities absent from the re-imported deck
- **THEN** those cards do not appear in the resulting deck and their saved progress is discarded

### Requirement: Deck identity is stable across filenames

A deck's storage identity SHALL be derived from its content (a stable function of its card identities) rather than from the import filename, so the same deck resolves to the same saved record regardless of what the file is named.

#### Scenario: Same deck imported under a different filename

- **WHEN** a learner re-imports the same deck from a file renamed since the first import
- **THEN** the import resolves to the existing saved record and progress is preserved via the merge rule

### Requirement: Legacy filename-keyed saves migrate without loss

Saved decks created before this change were keyed by filename. On first load after this change, the system SHALL preserve their progress by mapping the legacy record to the new content-based identity, without requiring the learner to re-import or losing any review state or coaching.

#### Scenario: Existing learner upgrades

- **WHEN** a learner who already has a filename-keyed saved deck loads the app after this change ships
- **THEN** their restored deck shows the same progress as before the upgrade
- **AND** a subsequent re-import of that deck preserves progress via the merge rule
