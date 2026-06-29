import { describe, expect, it } from 'vitest'
import { deckIdFromCards, isContentId } from '../deckId'

const ids = (...xs: string[]) => xs.map((id) => ({ id }))

describe('deckIdFromCards', () => {
  it('is independent of card order', () => {
    expect(deckIdFromCards(ids('a:0', 'b:0', 'c:1'))).toBe(
      deckIdFromCards(ids('c:1', 'a:0', 'b:0')),
    )
  })

  it('is stable across calls (deterministic)', () => {
    expect(deckIdFromCards(ids('x:0', 'y:0'))).toBe(deckIdFromCards(ids('x:0', 'y:0')))
  })

  it('changes when membership changes (added card)', () => {
    expect(deckIdFromCards(ids('a:0', 'b:0'))).not.toBe(
      deckIdFromCards(ids('a:0', 'b:0', 'c:0')),
    )
  })

  it('changes when membership changes (removed card)', () => {
    expect(deckIdFromCards(ids('a:0', 'b:0', 'c:0'))).not.toBe(
      deckIdFromCards(ids('a:0', 'b:0')),
    )
  })

  it('does not change when only card content would change (id is the only input)', () => {
    // Same ids, regardless of any other card fields the caller might hold.
    expect(deckIdFromCards(ids('a:0', 'b:0'))).toBe(deckIdFromCards(ids('a:0', 'b:0')))
  })

  it('is prefixed and fixed-width (two 8-hex hashes)', () => {
    expect(deckIdFromCards(ids('a:0'))).toMatch(/^deck-[0-9a-f]{16}$/)
  })

  it('handles an empty deck', () => {
    expect(deckIdFromCards([])).toMatch(/^deck-[0-9a-f]{16}$/)
  })

  it('distinguishes decks that differ only by one id', () => {
    expect(deckIdFromCards(ids('a:0'))).not.toBe(deckIdFromCards(ids('a:1')))
  })
})

describe('isContentId', () => {
  it('is true for an id derived from the same cards', () => {
    const cards = ids('a:0', 'b:0')
    expect(isContentId(deckIdFromCards(cards), cards)).toBe(true)
  })

  it('is false for a legacy filename-style id', () => {
    expect(isContentId('My Spanish Deck', ids('a:0', 'b:0'))).toBe(false)
  })
})
