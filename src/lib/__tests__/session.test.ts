import { describe, expect, it } from 'vitest'
import { newReviewState } from '../../types/deck'
import type { Card } from '../../types/deck'
import { DEFAULT_SRS_CONFIG } from '../srs'
import {
  answerCurrent,
  currentCardId,
  isComplete,
  remaining,
  startSession,
} from '../session'

const T0 = 1_700_000_000_000

function makeCard(id: string): Card {
  return {
    id,
    ankiNoteId: 0,
    noteType: 'Basic',
    fields: {},
    front: `front ${id}`,
    back: `back ${id}`,
    tags: [],
    reviewState: newReviewState(T0),
  }
}

const cards = ['a', 'b', 'c', 'd', 'e'].map(makeCard)
const byId = new Map(cards.map((c) => [c.id, c]))

describe('startSession', () => {
  it('queues all cards and zeroes stats', () => {
    const s = startSession(cards)
    expect(s.queue).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(s.stats).toEqual({ reviewed: 0, correct: 0, missed: 0 })
    expect(currentCardId(s)).toBe('a')
    expect(remaining(s)).toBe(5)
    expect(isComplete(s)).toBe(false)
  })
})

describe('answerCurrent — correct', () => {
  it('drops the card and updates stats', () => {
    const s0 = startSession(cards)
    const { state, updatedCard } = answerCurrent(
      s0,
      byId.get('a')!,
      'correct',
      T0,
      DEFAULT_SRS_CONFIG,
    )
    expect(state.queue).toEqual(['b', 'c', 'd', 'e'])
    expect(state.stats).toEqual({ reviewed: 1, correct: 1, missed: 0 })
    expect(updatedCard.reviewState.box).toBe(1) // rescheduled
  })
})

describe('answerCurrent — incorrect', () => {
  it('re-inserts the missed card reinsertGap positions back', () => {
    const s0 = startSession(cards)
    const { state, updatedCard } = answerCurrent(
      s0,
      byId.get('a')!,
      'incorrect',
      T0,
      DEFAULT_SRS_CONFIG, // reinsertGap = 3
    )
    // 'a' removed from front, re-inserted 3 back among [b,c,d,e]
    expect(state.queue).toEqual(['b', 'c', 'd', 'a', 'e'])
    expect(state.stats).toEqual({ reviewed: 1, correct: 0, missed: 1 })
    expect(updatedCard.reviewState.box).toBe(0)
    expect(updatedCard.reviewState.lapses).toBe(1)
  })

  it('does not repeat the missed card immediately', () => {
    const s0 = startSession(cards)
    const { state } = answerCurrent(s0, byId.get('a')!, 'incorrect', T0, DEFAULT_SRS_CONFIG)
    expect(currentCardId(state)).not.toBe('a')
  })

  it('appends at the end when the queue is shorter than the gap', () => {
    const small = startSession([makeCard('x'), makeCard('y')])
    const { state } = answerCurrent(
      small,
      byId.get('x') ?? makeCard('x'),
      'incorrect',
      T0,
      DEFAULT_SRS_CONFIG,
    )
    expect(state.queue).toEqual(['y', 'x'])
  })
})

describe('session completion', () => {
  it('empties the queue after all-correct and reports complete', () => {
    let state = startSession(cards)
    let now = T0
    while (!isComplete(state)) {
      const id = currentCardId(state)!
      const res = answerCurrent(state, byId.get(id)!, 'correct', now, DEFAULT_SRS_CONFIG)
      state = res.state
      now += 1000
    }
    expect(isComplete(state)).toBe(true)
    expect(state.stats.reviewed).toBe(5)
    expect(state.stats.correct).toBe(5)
  })
})
