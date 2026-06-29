## MODIFIED Requirements

### Requirement: Re-import preserves existing progress

When a deck is imported and a previously-saved deck with the same deck identity already exists in this browser, the system SHALL carry each existing card's progress forward, matched by card id. In-app study SHALL always win: a card already studied here (reps ≥ 1) keeps its existing `reviewState`. A card not yet studied here SHALL adopt the freshly-imported card's `reviewState`, allowing a re-import to refresh scheduling (including resumed Anki history) without clobbering reviewed cards. Coaching memory SHALL be carried forward whenever present.

#### Scenario: Same deck re-imported after in-app study

- **WHEN** a learner has studied cards in-app (reps ≥ 1) and re-imports the same deck
- **THEN** those studied cards retain their in-app `reviewState` and `coaching`
- **AND** no card studied in-app appears as new

#### Scenario: Re-import refreshes an un-studied card's schedule

- **WHEN** an existing card has not been studied in-app (reps 0) and the re-imported card carries a schedule (fresh-new, or resumed from Anki history)
- **THEN** the existing card adopts the imported `reviewState`

#### Scenario: First import of a never-seen deck

- **WHEN** a learner imports a deck for which no saved deck exists in this browser
- **THEN** each card uses the review state produced by the importer (new, or resumed from Anki)
