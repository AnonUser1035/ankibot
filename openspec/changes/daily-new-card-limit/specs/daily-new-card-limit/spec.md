## ADDED Requirements

### Requirement: New cards are capped per local day

The scheduler SHALL introduce at most `newCardsPerDay` brand-new cards (reps === 0) per local day across all study sessions for a deck. Once that many have been introduced today, `buildSession` SHALL serve zero new cards until the next local day, regardless of how many sessions are started.

#### Scenario: Budget spent within a session

- **WHEN** a deck has introduced the full daily allowance of new cards today
- **THEN** a newly built session contains no new cards
- **AND** due review cards are still included

#### Scenario: Budget partially spent

- **WHEN** `k` of `newCardsPerDay` new cards have been introduced today (`k < newCardsPerDay`)
- **THEN** a newly built session includes at most `newCardsPerDay − k` new cards

#### Scenario: Deck with no remaining new cards but pending reviews

- **WHEN** the daily new-card budget is spent and reviews are due
- **THEN** the session serves only the due reviews

### Requirement: Daily ledger tracks and resets by local day

A deck SHALL hold a `dailyNew` ledger recording the local-midnight day key and the count of new cards introduced on that day. A ledger whose day key is not the current local day SHALL be treated as zero introductions today (implicit reset).

#### Scenario: New day resets the budget

- **WHEN** the ledger records the full allowance introduced on a previous day
- **THEN** on the next local day the full daily allowance is available again

#### Scenario: Accumulation across sessions on the same day

- **WHEN** new cards are introduced in two separate sessions on the same day
- **THEN** the ledger reflects the sum, and the remaining allowance decreases accordingly

### Requirement: An introduction is counted on first study

A brand-new card (reps === 0) SHALL count against the daily budget the first time it is studied, whether graded correct or incorrect, and SHALL NOT be counted again on subsequent reviews.

#### Scenario: First grade of a new card

- **WHEN** a card with reps === 0 is graded
- **THEN** the deck's `dailyNew.introduced` for today increases by one

#### Scenario: Re-review of an already-introduced card

- **WHEN** a card with reps >= 1 is graded
- **THEN** the daily ledger is unchanged

### Requirement: Daily ledger persists across reloads

The `dailyNew` ledger SHALL be part of the saved deck so that the day's progress against the new-card limit survives a reload and is included in exported backups. Saves predating the ledger SHALL load as zero introductions today.

#### Scenario: Reload after hitting the cap

- **WHEN** a learner reaches the daily new-card limit and reloads the app
- **THEN** the restored deck still reflects the limit as reached for the remainder of the day

#### Scenario: Loading a pre-ledger save

- **WHEN** a save created before this change is loaded
- **THEN** it reads as no new cards introduced today and the full daily allowance is available

### Requirement: Deck screen reflects the cap

The deck screen SHALL present new and review counts separately, gate the Study action on what is actually studyable now, and, when the daily new-card budget is spent while unlearned cards remain, communicate that today's new cards are done and when more become available.

#### Scenario: Cap reached with unlearned cards remaining

- **WHEN** the daily new-card budget is spent and unlearned cards remain but no reviews are due
- **THEN** the screen indicates today's new cards are complete and that more are available on the next day, rather than offering a new-card session

#### Scenario: Studyable work available

- **WHEN** new cards remain in today's budget or reviews are due
- **THEN** the Study action offers exactly the number of cards a session would serve
