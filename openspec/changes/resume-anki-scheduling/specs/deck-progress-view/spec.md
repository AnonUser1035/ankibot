## ADDED Requirements

### Requirement: Deck screen shows a progress breakdown

The deck screen SHALL present, separately, the work actionable now and the learned cards waiting in the schedule, so that studied-but-not-due cards remain visible rather than being absorbed into the total card count. It SHALL surface at least: cards due now, new cards available today, cards already started (reps ≥ 1), and cards coming up later.

#### Scenario: Deck with studied but not-yet-due cards

- **WHEN** a deck has cards that were studied (reps ≥ 1) and are scheduled for the future
- **THEN** those cards are reflected in a "started"/"coming up" count, not hidden, even when zero cards are due now

#### Scenario: Upcoming review timing

- **WHEN** there are learned cards not yet due
- **THEN** the screen indicates when the next one becomes due

#### Scenario: Fresh deck with no progress

- **WHEN** no cards have been started
- **THEN** the breakdown shows zero started and does not display a misleading progress indicator
