import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { ImportError, importApkgArchive } from '../importApkg'
import {
  buildBasicApkg,
  buildEmptyApkg,
  buildEmptyModelsApkg,
  buildJunk,
  buildLeadingNumberApkg,
  buildMediaApkg,
  buildMixedClozeApkg,
  buildNewerFormatApkg,
  buildNoDbApkg,
} from './fixtures'

let SQL: SqlJsStatic

beforeAll(async () => {
  // Load the WASM binary directly so init is environment-independent.
  const wasmBinary = fs.readFileSync(
    path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'),
  )
  // `wasmBinary` is a valid emscripten option but sql.js's types expect an
  // ArrayBuffer; a Node Buffer works fine at runtime, so cast through unknown.
  SQL = await initSqlJs({
    wasmBinary,
  } as unknown as Parameters<typeof initSqlJs>[0])
})

describe('importApkgArchive — happy path', () => {
  it('imports basic cards with correct front/back, count, tags', async () => {
    const bytes = await buildBasicApkg(SQL)
    const { deck, skipped } = await importApkgArchive(bytes, 'My French Deck.apkg', SQL)

    expect(deck.name).toBe('My French Deck')
    expect(deck.cards).toHaveLength(3)
    expect(skipped.cloze).toBe(0)

    const first = deck.cards[0]
    expect(first.front).toBe('Capital of France?') // <b> stripped
    expect(first.back).toBe('Paris')
    expect(first.noteType).toBe('Basic')
    expect(first.tags).toEqual(['geo', 'europe'])
  })

  it('strips HTML including <img> and <br> from fields', async () => {
    const bytes = await buildBasicApkg(SQL)
    const { deck } = await importApkgArchive(bytes, 'deck.apkg', SQL)
    const card = deck.cards[2]
    expect(card.front).toBe('Photo caption') // <br> -> space, <img> dropped
    expect(card.back).toBe('An answer') // <i> stripped
  })

  it('initializes every card to fresh "new card" review state', async () => {
    const bytes = await buildBasicApkg(SQL)
    const { deck } = await importApkgArchive(bytes, 'deck.apkg', SQL)
    for (const card of deck.cards) {
      expect(card.reviewState.box).toBe(0)
      expect(card.reviewState.reps).toBe(0)
      expect(card.reviewState.lapses).toBe(0)
      expect(card.reviewState.lastReviewed).toBeNull()
      expect(typeof card.reviewState.due).toBe('number')
    }
  })

  it('derives a stable id from note guid + ord', async () => {
    const bytes = await buildBasicApkg(SQL)
    const { deck } = await importApkgArchive(bytes, 'deck.apkg', SQL)
    expect(deck.cards[0].id).toBe('a:0')
  })

  it('uses the card template (not field position) for front/back', async () => {
    // Notetype leads with a numeric "Rank" field; the question/answer live in
    // later fields and are selected by the template. Regression test: front
    // must be the word, not the rank number.
    const bytes = await buildLeadingNumberApkg(SQL)
    const { deck } = await importApkgArchive(bytes, 'ranked.apkg', SQL)

    expect(deck.cards).toHaveLength(2)
    expect(deck.cards[0].front).toBe('Bonjour')
    expect(deck.cards[0].back).toBe('Hello')
    expect(deck.cards[1].front).toBe('Merci')
    expect(deck.cards[1].back).toBe('Thank you')
    // The rank number must not leak into the visible card.
    expect(deck.cards[0].front).not.toBe('1')
  })
})

describe('importApkgArchive — media handling (scope guard)', () => {
  it('skips media-only cards and reports the count, keeping text cards', async () => {
    const bytes = await buildMediaApkg(SQL)
    const { deck, skipped } = await importApkgArchive(bytes, 'media.apkg', SQL)
    expect(deck.cards).toHaveLength(1)
    expect(deck.cards[0].front).toBe('Real question?')
    expect(skipped.media).toBe(1)
    expect(skipped.cloze).toBe(0)
  })
})

describe('importApkgArchive — cloze handling', () => {
  it('skips cloze cards (by notetype and by markup) and reports the count', async () => {
    const bytes = await buildMixedClozeApkg(SQL)
    const { deck, skipped } = await importApkgArchive(bytes, 'mixed.apkg', SQL)
    expect(deck.cards).toHaveLength(1)
    expect(deck.cards[0].front).toBe('Basic front')
    expect(skipped.cloze).toBe(2)
  })
})

describe('importApkgArchive — error cases', () => {
  it('rejects a non-zip file with an actionable message', async () => {
    await expect(importApkgArchive(buildJunk(), 'junk.apkg', SQL)).rejects.toThrow(
      ImportError,
    )
  })

  it('rejects the newer zstd format with a re-export hint', async () => {
    const bytes = await buildNewerFormatApkg()
    await expect(
      importApkgArchive(bytes, 'new.apkg', SQL),
    ).rejects.toThrow(/newer Anki export format/i)
  })

  it('rejects an empty col.models (newer schema) with a re-export hint', async () => {
    const bytes = await buildEmptyModelsApkg(SQL)
    await expect(
      importApkgArchive(bytes, 'new.apkg', SQL),
    ).rejects.toThrow(/newer Anki export format/i)
  })

  it('rejects an archive with no collection database', async () => {
    const bytes = await buildNoDbApkg()
    await expect(
      importApkgArchive(bytes, 'nodeck.apkg', SQL),
    ).rejects.toThrow(/collection database/i)
  })

  it('rejects an empty deck', async () => {
    const bytes = await buildEmptyApkg(SQL)
    await expect(importApkgArchive(bytes, 'empty.apkg', SQL)).rejects.toThrow(
      /no cards/i,
    )
  })
})
