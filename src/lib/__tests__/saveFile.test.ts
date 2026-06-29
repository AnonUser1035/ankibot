import { describe, expect, it } from 'vitest'
import {
  SAVE_FORMAT_VERSION,
  SaveFileError,
  deserialize,
  saveFileName,
  serialize,
} from '../saveFile'
import { type Deck, newReviewState } from '../../types/deck'

function sampleDeck(): Deck {
  return {
    id: 'deck-1',
    name: 'French Capitals',
    importedAt: 1_700_000_000_000,
    cards: [
      {
        id: 'a:0',
        ankiNoteId: 1000,
        noteType: 'Basic',
        fields: { Front: 'Capital of France?', Back: 'Paris' },
        front: 'Capital of France?',
        back: 'Paris',
        tags: ['geo', 'europe'],
        reviewState: { box: 3, due: 1_700_100_000_000, reps: 5, lapses: 1, lastReviewed: 1_700_050_000_000 },
      },
      {
        id: 'b:0',
        ankiNoteId: 1001,
        noteType: 'Basic',
        fields: { Front: '2+2', Back: '4' },
        front: '2+2',
        back: '4',
        tags: [],
        reviewState: newReviewState(1_700_000_000_000),
      },
    ],
  }
}

describe('serialize / deserialize', () => {
  it('round-trips a deck with full review state intact', () => {
    const deck = sampleDeck()
    const save = serialize(deck, 1_700_200_000_000)

    expect(save.version).toBe(SAVE_FORMAT_VERSION)
    expect(save.exportedAt).toBe(1_700_200_000_000)

    // Through a JSON boundary, as both the file and IndexedDB would.
    const { deck: restored, version } = deserialize(JSON.parse(JSON.stringify(save)))
    expect(version).toBe(SAVE_FORMAT_VERSION)
    expect(restored).toEqual(deck)
  })

  it('ignores unknown fields (forward compatibility)', () => {
    const save = serialize(sampleDeck())
    const withExtra = {
      ...save,
      futureField: 'whatever',
      deck: { ...save.deck, coachingNotes: ['later'] },
    }
    const { deck } = deserialize(withExtra)
    expect(deck.cards).toHaveLength(2)
    expect('coachingNotes' in deck).toBe(false)
  })

  it('rejects a newer save format version', () => {
    const save = { ...serialize(sampleDeck()), version: SAVE_FORMAT_VERSION + 1 }
    expect(() => deserialize(save)).toThrow(SaveFileError)
  })

  it('rejects non-object input', () => {
    expect(() => deserialize(null)).toThrow(SaveFileError)
    expect(() => deserialize('a string')).toThrow(SaveFileError)
    expect(() => deserialize(42)).toThrow(SaveFileError)
  })

  it('rejects a missing/invalid version', () => {
    expect(() => deserialize({ deck: sampleDeck() })).toThrow(SaveFileError)
    expect(() => deserialize({ version: 'one', deck: sampleDeck() })).toThrow(SaveFileError)
  })

  it('rejects structurally damaged deck data', () => {
    const base = serialize(sampleDeck())
    expect(() => deserialize({ ...base, deck: { id: 'x', name: 'y' } })).toThrow(
      SaveFileError,
    )
    expect(() =>
      deserialize({ ...base, deck: { ...base.deck, cards: [{ noteType: 'Basic' }] } }),
    ).toThrow(SaveFileError)
  })

  it('fills sane defaults for a card missing review state fields', () => {
    const base = serialize(sampleDeck())
    const damaged = {
      ...base,
      deck: {
        ...base.deck,
        cards: [{ id: 'c:0', reviewState: {} }],
      },
    }
    const { deck } = deserialize(damaged)
    expect(deck.cards[0].reviewState).toEqual({
      box: 0,
      due: 0,
      reps: 0,
      lapses: 0,
      lastReviewed: null,
    })
  })
})

describe('saveFileName', () => {
  it('slugifies the deck name and stamps the date', () => {
    const name = saveFileName(sampleDeck(), Date.UTC(2026, 5, 29, 12))
    expect(name).toMatch(/^french-capitals-2026\d{4}\.ankitutor\.json$/)
  })

  it('falls back to "deck" for an empty name', () => {
    const deck = { ...sampleDeck(), name: '   ' }
    expect(saveFileName(deck, Date.UTC(2026, 0, 1, 12))).toMatch(
      /^deck-2026\d{4}\.ankitutor\.json$/,
    )
  })
})
