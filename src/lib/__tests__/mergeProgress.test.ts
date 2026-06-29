import { describe, expect, it } from 'vitest'
import { type Card, type Coaching, type Deck, newCoaching, newReviewState } from '../../types/deck'
import { mergeProgress } from '../mergeProgress'

const T0 = 1_700_000_000_000

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    ankiNoteId: 0,
    noteType: 'Basic',
    fields: { Front: `front ${id}`, Back: `back ${id}` },
    front: `front ${id}`,
    back: `back ${id}`,
    tags: [],
    reviewState: newReviewState(T0),
    coaching: newCoaching(),
    ...overrides,
  }
}

function makeDeck(id: string, cards: Card[]): Deck {
  return { id, name: id, importedAt: T0, cards }
}

const studied = (id: string): Card =>
  makeCard(id, {
    reviewState: { box: 3, due: T0 + 1000, reps: 5, lapses: 1, lastReviewed: T0 },
    coaching: { note: 'mixes up gender', lastWrongAnswer: 'el agua', missCount: 2, updatedAt: T0 } as Coaching,
  })

describe('mergeProgress', () => {
  it('carries review state and coaching forward for matched cards', () => {
    const existing = makeDeck('d', [studied('a:0'), studied('b:0')])
    const imported = makeDeck('d', [makeCard('a:0'), makeCard('b:0')])

    const merged = mergeProgress(existing, imported)

    expect(merged.cards.map((c) => c.reviewState.box)).toEqual([3, 3])
    expect(merged.cards.map((c) => c.reviewState.reps)).toEqual([5, 5])
    expect(merged.cards[0].coaching?.note).toBe('mixes up gender')
    expect(merged.cards[0].coaching?.missCount).toBe(2)
  })

  it('matches by id, independent of order', () => {
    const existing = makeDeck('d', [studied('a:0'), makeCard('b:0')])
    const imported = makeDeck('d', [makeCard('b:0'), makeCard('a:0')])

    const merged = mergeProgress(existing, imported)
    const a = merged.cards.find((c) => c.id === 'a:0')

    expect(a?.reviewState.box).toBe(3)
  })

  it('keeps imported content while carrying progress (edited card)', () => {
    const existing = makeDeck('d', [studied('a:0')])
    const imported = makeDeck('d', [
      makeCard('a:0', { front: 'edited front', back: 'edited back' }),
    ])

    const merged = mergeProgress(existing, imported)

    expect(merged.cards[0].front).toBe('edited front')
    expect(merged.cards[0].reviewState.box).toBe(3)
  })

  it('starts added cards fresh', () => {
    const existing = makeDeck('d', [studied('a:0')])
    const imported = makeDeck('d', [makeCard('a:0'), makeCard('c:0')])

    const merged = mergeProgress(existing, imported)
    const added = merged.cards.find((c) => c.id === 'c:0')

    expect(added?.reviewState.reps).toBe(0)
    expect(added?.reviewState.box).toBe(0)
  })

  it('drops cards no longer in the import', () => {
    const existing = makeDeck('d', [studied('a:0'), studied('gone:0')])
    const imported = makeDeck('d', [makeCard('a:0')])

    const merged = mergeProgress(existing, imported)

    expect(merged.cards.map((c) => c.id)).toEqual(['a:0'])
  })

  it('is a content no-op when existing is empty (first import)', () => {
    const imported = makeDeck('d', [makeCard('a:0'), makeCard('b:0')])
    const merged = mergeProgress(makeDeck('d', []), imported)

    expect(merged.cards.every((c) => c.reviewState.reps === 0)).toBe(true)
    expect(merged.cards.map((c) => c.id)).toEqual(['a:0', 'b:0'])
  })

  it('takes deck identity from the imported deck', () => {
    const existing = makeDeck('old-id', [studied('a:0')])
    const imported = makeDeck('new-id', [makeCard('a:0')])

    expect(mergeProgress(existing, imported).id).toBe('new-id')
  })

  it('does not mutate either input', () => {
    const existing = makeDeck('d', [studied('a:0')])
    const imported = makeDeck('d', [makeCard('a:0')])

    mergeProgress(existing, imported)

    expect(imported.cards[0].reviewState.box).toBe(0)
    expect(existing.cards[0].reviewState.box).toBe(3)
  })

  it('lets an un-studied existing card adopt the import schedule (Anki resume)', () => {
    // Existing card is new (reps 0); import carries a resumed Anki schedule.
    const existing = makeDeck('d', [makeCard('a:0')])
    const imported = makeDeck('d', [
      makeCard('a:0', {
        reviewState: { box: 4, due: T0 + 5000, reps: 8, lapses: 1, lastReviewed: T0 },
      }),
    ])

    const merged = mergeProgress(existing, imported)

    expect(merged.cards[0].reviewState.box).toBe(4) // import schedule wins
    expect(merged.cards[0].reviewState.reps).toBe(8)
  })

  it('still protects in-app study against a re-import schedule', () => {
    const existing = makeDeck('d', [studied('a:0')]) // reps 5, box 3
    const imported = makeDeck('d', [
      makeCard('a:0', {
        reviewState: { box: 1, due: T0, reps: 1, lapses: 0, lastReviewed: T0 },
      }),
    ])

    const merged = mergeProgress(existing, imported)

    expect(merged.cards[0].reviewState.box).toBe(3) // existing in-app progress kept
    expect(merged.cards[0].reviewState.reps).toBe(5)
  })

  it('falls back to imported coaching when the existing record lacks one', () => {
    const old = makeCard('a:0', { reviewState: { box: 2, due: T0, reps: 3, lapses: 0, lastReviewed: T0 } })
    delete old.coaching
    const existing = makeDeck('d', [old])
    const imported = makeDeck('d', [makeCard('a:0')])

    const merged = mergeProgress(existing, imported)

    expect(merged.cards[0].reviewState.box).toBe(2)
    expect(merged.cards[0].coaching).toEqual(newCoaching())
  })
})
