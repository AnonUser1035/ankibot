import { describe, expect, it } from 'vitest'
import { applyCoaching } from '../coaching'
import { type Card, type Coaching, newCoaching, newReviewState } from '../../types/deck'

function card(coaching?: Coaching): Card {
  return {
    id: 'c:0',
    ankiNoteId: 1,
    noteType: 'Basic',
    fields: {},
    front: 'Q',
    back: 'A',
    tags: [],
    reviewState: newReviewState(0),
    coaching,
  }
}

const NOW = 1_700_000_000_000

describe('applyCoaching', () => {
  it('on a miss: increments missCount and records the last wrong answer', () => {
    const next = applyCoaching(card(newCoaching()), 'incorrect', { lastAnswer: ' Lyon ' }, NOW)
    expect(next.missCount).toBe(1)
    expect(next.lastWrongAnswer).toBe('Lyon') // trimmed
    expect(next.updatedAt).toBe(NOW)
  })

  it('increments missCount even without an answer or AI note (deterministic baseline)', () => {
    const next = applyCoaching(card({ missCount: 2, updatedAt: 1 }), 'incorrect', undefined, NOW)
    expect(next.missCount).toBe(3)
    expect(next.lastWrongAnswer).toBeUndefined()
  })

  it('on a correct press with no note: returns the prior record unchanged', () => {
    const prev = { note: 'x', missCount: 1, updatedAt: 5 }
    const next = applyCoaching(card(prev), 'correct', undefined, NOW)
    expect(next).toBe(prev) // same reference — caller can skip the write
  })

  it('saves the AI memory note when present (even on a correct answer)', () => {
    const next = applyCoaching(card(newCoaching()), 'correct', { memoryNote: 'mixes up cities' }, NOW)
    expect(next.note).toBe('mixes up cities')
    expect(next.updatedAt).toBe(NOW)
  })

  it('a null memory note leaves the prior note intact', () => {
    const next = applyCoaching(
      card({ note: 'keep me', missCount: 1, updatedAt: 5 }),
      'incorrect',
      { memoryNote: null },
      NOW,
    )
    expect(next.note).toBe('keep me')
    expect(next.missCount).toBe(2)
  })

  it('an empty memory note clears the prior note', () => {
    const next = applyCoaching(
      card({ note: 'old', missCount: 0, updatedAt: 5 }),
      'correct',
      { memoryNote: '   ' },
      NOW,
    )
    expect(next.note).toBeUndefined()
  })

  it('treats a card with no coaching as empty', () => {
    const next = applyCoaching(card(undefined), 'incorrect', { lastAnswer: 'nope' }, NOW)
    expect(next.missCount).toBe(1)
    expect(next.lastWrongAnswer).toBe('nope')
  })
})
