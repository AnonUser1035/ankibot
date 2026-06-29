## ADDED Requirements

### Requirement: Already-studied Anki cards resume on import

The importer SHALL read each Anki card's scheduling (`type`, `queue`, `due`, `ivl`, `reps`, `lapses`, `mod`) and the collection creation time (`col.crt`), and map it onto our `ReviewState` so a card studied in Anki keeps its maturity, due date, reps, and lapses. A card that has never been reviewed SHALL be imported as a new card.

#### Scenario: Mature review card

- **WHEN** an imported card has been reviewed in Anki (reps > 0, a positive interval, type review)
- **THEN** its imported review state has reps and lapses preserved, a Leitner box reflecting the interval, and a due date derived from `col.crt` plus the stored day offset

#### Scenario: Never-studied card

- **WHEN** an imported card has no review history (reps 0 or type new)
- **THEN** it is imported as a new card (box 0, reps 0, no last-reviewed time)

#### Scenario: Learning / relearning card

- **WHEN** an imported card is in a learning or relearning state with an epoch-timestamp due
- **THEN** its imported due date reflects that timestamp and it is treated as a studied (non-new) card

### Requirement: Interval maps to the nearest Leitner box

The importer SHALL place a studied card in the highest Leitner box whose interval does not exceed the card's Anki interval (in days), never below box 1, and never above the configured maximum box. Negative (sub-day, seconds) intervals SHALL be treated as less than one day.

#### Scenario: Interval-to-box mapping

- **WHEN** a studied card has an interval of 15 days and boxes are `[0,1,2,4,8,16]`
- **THEN** it is placed in box 4

#### Scenario: Interval beyond the top box

- **WHEN** a studied card's interval exceeds the largest configured box interval
- **THEN** it is placed in the maximum box

### Requirement: Import degrades safely on unexpected scheduling data

When scheduling data is missing or in an unrecognized encoding (e.g. no `col.crt`, or an out-of-range due value), the importer SHALL still produce a usable review state rather than failing, defaulting such a card to due now.

#### Scenario: Missing collection creation time

- **WHEN** a review card is imported but `col.crt` is unavailable
- **THEN** the card is imported as studied (reps/box preserved) and scheduled due now
