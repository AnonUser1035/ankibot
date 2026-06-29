import { describe, expect, it } from 'vitest'
import { newReviewState } from '../../types/deck'
import type { Card, Deck } from '../../types/deck'
import {
  DEFAULT_SRS_CONFIG,
  applyAnswer,
  buildSession,
  isDue,
  maxBox,
  newIntroducedToday,
  newRemainingToday,
  recordNewIntroductions,
  startOfLocalDay,
} from '../srs'

const DAY_MS = 24 * 60 * 60 * 1000
const T0 = 1_700_000_000_000 // fixed base "now"

function makeCard(id: string, now = T0, overrides: Partial<Card> = {}): Card {
  return {
    id,
    ankiNoteId: Number.parseInt(id, 36) || 0,
    noteType: 'Basic',
    fields: { Front: `front ${id}`, Back: `back ${id}` },
    front: `front ${id}`,
    back: `back ${id}`,
    tags: [],
    reviewState: newReviewState(now),
    ...overrides,
  }
}

describe('isDue', () => {
  it('is due when due <= now', () => {
    const c = makeCard('a', T0)
    expect(isDue(c, T0)).toBe(true)
    expect(isDue(c, T0 - 1)).toBe(false)
  })
})

describe('applyAnswer — immutability', () => {
  it('returns a new card and does not mutate the input', () => {
    const c = makeCard('a', T0)
    const out = applyAnswer(c, 'correct', T0)
    expect(out).not.toBe(c)
    expect(c.reviewState.box).toBe(0) // original untouched
    expect(c.reviewState.reps).toBe(0)
  })
})

describe('applyAnswer — correct climbs boxes across simulated days', () => {
  it('advances box-by-box with the right intervals, then caps at maxBox', () => {
    const intervals = DEFAULT_SRS_CONFIG.intervalsDays // [0,1,2,4,8,16]
    let card = makeCard('a', T0)
    let now = T0

    // Walk up the boxes, each time jumping `now` to the card's due date.
    for (let box = 1; box <= maxBox(DEFAULT_SRS_CONFIG); box++) {
      card = applyAnswer(card, 'correct', now)
      expect(card.reviewState.box).toBe(box)
      expect(card.reviewState.reps).toBe(box)
      expect(card.reviewState.lastReviewed).toBe(now)
      expect(card.reviewState.due).toBe(now + intervals[box] * DAY_MS)
      // Not due until the interval elapses.
      expect(isDue(card, now)).toBe(intervals[box] === 0)
      expect(isDue(card, card.reviewState.due)).toBe(true)
      now = card.reviewState.due
    }

    // Already at max box; another correct keeps it there with the max interval.
    const top = maxBox(DEFAULT_SRS_CONFIG)
    card = applyAnswer(card, 'correct', now)
    expect(card.reviewState.box).toBe(top)
    expect(card.reviewState.due).toBe(now + intervals[top] * DAY_MS)
  })
})

describe('applyAnswer — incorrect resets and lapses', () => {
  it('resets box to 0, due now, increments lapses and reps', () => {
    // Get a card up to box 3 first.
    let card = makeCard('a', T0)
    let now = T0
    for (let i = 0; i < 3; i++) {
      card = applyAnswer(card, 'correct', now)
      now = card.reviewState.due
    }
    expect(card.reviewState.box).toBe(3)
    const repsBefore = card.reviewState.reps

    const missed = applyAnswer(card, 'incorrect', now)
    expect(missed.reviewState.box).toBe(0)
    expect(missed.reviewState.due).toBe(now)
    expect(missed.reviewState.lapses).toBe(1)
    expect(missed.reviewState.reps).toBe(repsBefore + 1)
    expect(isDue(missed, now)).toBe(true)
  })
})

describe('buildSession', () => {
  function deckOf(cards: Card[]): Deck {
    return { id: 'd', name: 'd', importedAt: T0, cards }
  }

  it('includes only due cards by default', () => {
    const due = makeCard('due', T0)
    const future = makeCard('future', T0, {
      reviewState: { ...newReviewState(T0), reps: 1, due: T0 + 5 * DAY_MS },
    })
    const session = buildSession(deckOf([due, future]), T0)
    expect(session.map((c) => c.id)).toEqual(['due'])
  })

  it('caps new cards at the daily limit', () => {
    const cards = Array.from({ length: 50 }, (_, i) => makeCard(`n${i}`, T0))
    const session = buildSession(deckOf(cards), T0, {
      ...DEFAULT_SRS_CONFIG,
      newCardsPerDay: 20,
    })
    expect(session).toHaveLength(20)
  })

  it('study-ahead includes not-yet-due cards', () => {
    const due = makeCard('due', T0)
    const future = makeCard('future', T0, {
      reviewState: { ...newReviewState(T0), reps: 1, due: T0 + 5 * DAY_MS },
    })
    const session = buildSession(deckOf([due, future]), T0, DEFAULT_SRS_CONFIG, {
      studyAhead: true,
    })
    expect(session.map((c) => c.id).sort()).toEqual(['due', 'future'])
  })

  it('respects maxReviewsPerSession', () => {
    const reviews = Array.from({ length: 10 }, (_, i) =>
      makeCard(`r${i}`, T0, {
        reviewState: { ...newReviewState(T0), reps: 2, due: T0 - DAY_MS },
      }),
    )
    const session = buildSession(deckOf(reviews), T0, {
      ...DEFAULT_SRS_CONFIG,
      maxReviewsPerSession: 4,
    })
    expect(session).toHaveLength(4)
  })

  it('serves no new cards once today\'s budget is spent, but still serves reviews', () => {
    const news = Array.from({ length: 50 }, (_, i) => makeCard(`n${i}`, T0))
    const review = makeCard('r', T0, {
      reviewState: { ...newReviewState(T0), reps: 2, due: T0 - DAY_MS },
    })
    const deck = {
      ...deckOf([...news, review]),
      dailyNew: { day: startOfLocalDay(T0), introduced: 20 },
    }
    const session = buildSession(deck, T0)
    expect(session.map((c) => c.id)).toEqual(['r']) // review only, zero new
  })

  it('serves the remainder of the daily budget when partially spent', () => {
    const news = Array.from({ length: 50 }, (_, i) => makeCard(`n${i}`, T0))
    const deck = {
      ...deckOf(news),
      dailyNew: { day: startOfLocalDay(T0), introduced: 18 },
    }
    expect(buildSession(deck, T0)).toHaveLength(2) // 20 - 18
  })

  it('resets the budget when the ledger is for an earlier day', () => {
    const news = Array.from({ length: 50 }, (_, i) => makeCard(`n${i}`, T0))
    const yesterday = startOfLocalDay(T0) - DAY_MS
    const deck = { ...deckOf(news), dailyNew: { day: yesterday, introduced: 20 } }
    expect(buildSession(deck, T0)).toHaveLength(20) // yesterday's count doesn't apply
  })
})

describe('daily new-card ledger', () => {
  const deck = { id: 'd', name: 'd', importedAt: T0, cards: [] }

  it('startOfLocalDay is idempotent within a day and stable', () => {
    const a = startOfLocalDay(T0)
    expect(startOfLocalDay(a)).toBe(a)
    expect(startOfLocalDay(T0 + 1000)).toBe(a)
  })

  it('counts zero introductions for a fresh deck', () => {
    expect(newIntroducedToday(deck, T0)).toBe(0)
    expect(newRemainingToday(deck, T0)).toBe(DEFAULT_SRS_CONFIG.newCardsPerDay)
  })

  it('records and accumulates introductions for today', () => {
    const d1 = recordNewIntroductions(deck, 1, T0)
    const d2 = recordNewIntroductions(d1, 1, T0)
    expect(newIntroducedToday(d2, T0)).toBe(2)
    expect(newRemainingToday(d2, T0)).toBe(18)
  })

  it('rolls over to a new day, discarding the old count', () => {
    const today = recordNewIntroductions(deck, 20, T0)
    const tomorrow = T0 + DAY_MS
    expect(newRemainingToday(today, tomorrow)).toBe(DEFAULT_SRS_CONFIG.newCardsPerDay)
    const bumped = recordNewIntroductions(today, 1, tomorrow)
    expect(newIntroducedToday(bumped, tomorrow)).toBe(1)
  })

  it('is a no-op for count <= 0 (same reference)', () => {
    expect(recordNewIntroductions(deck, 0, T0)).toBe(deck)
  })

  it('never reports negative remaining when over the limit', () => {
    const over = { ...deck, dailyNew: { day: startOfLocalDay(T0), introduced: 25 } }
    expect(newRemainingToday(over, T0)).toBe(0)
  })
})
