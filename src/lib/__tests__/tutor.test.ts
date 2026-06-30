import { describe, expect, it } from 'vitest'
import { VERDICT_SENTINEL, parseTutorOutput } from '../tutor'

describe('parseTutorOutput (structured verdict tail)', () => {
  it('splits streamed prose from a valid verdict tail', () => {
    const full =
      `Nice try! The capital is Paris.\n${VERDICT_SENTINEL}` +
      `{"verdict":"incorrect","suggestedRating":"missed_it","memoryNote":"says Lyon, it's Paris"}`
    const { prose, verdict } = parseTutorOutput(full)
    expect(prose).toBe('Nice try! The capital is Paris.')
    expect(verdict).toEqual({
      verdict: 'incorrect',
      suggestedRating: 'missed_it',
      memoryNote: "says Lyon, it's Paris",
    })
  })

  it('no sentinel → all prose, null verdict (graceful fallback to manual rating)', () => {
    const { prose, verdict } = parseTutorOutput('Just chatting, no answer yet.')
    expect(prose).toBe('Just chatting, no answer yet.')
    expect(verdict).toBeNull()
  })

  it('malformed JSON tail → prose preserved, null verdict (no crash)', () => {
    const full = `Here is the answer.${VERDICT_SENTINEL}{not valid json`
    const { prose, verdict } = parseTutorOutput(full)
    expect(prose).toBe('Here is the answer.')
    expect(verdict).toBeNull()
  })

  it('tolerates a ```json code fence around the tail', () => {
    const full =
      `Correct!${VERDICT_SENTINEL}\n` +
      '```json\n{"verdict":"correct","suggestedRating":"got_it","memoryNote":null}\n```'
    const { verdict } = parseTutorOutput(full)
    expect(verdict).toEqual({
      verdict: 'correct',
      suggestedRating: 'got_it',
      memoryNote: null,
    })
  })

  it('derives the suggestion from verdict when suggestedRating is missing/invalid', () => {
    const full = `ok${VERDICT_SENTINEL}{"verdict":"partial"}`
    const { verdict } = parseTutorOutput(full)
    expect(verdict?.suggestedRating).toBe('missed_it') // partial → missed_it
  })

  it('rejects an invalid verdict value', () => {
    const full = `ok${VERDICT_SENTINEL}{"verdict":"maybe","suggestedRating":"got_it"}`
    expect(parseTutorOutput(full).verdict).toBeNull()
  })

  it('tolerates a trailing sign-off after the verdict JSON (still advances)', () => {
    const full =
      `Well done!${VERDICT_SENTINEL}` +
      '{"verdict":"correct","suggestedRating":"got_it","memoryNote":null}\nReady for more?'
    const { prose, verdict } = parseTutorOutput(full)
    expect(prose).toBe('Well done!')
    expect(verdict).toEqual({
      verdict: 'correct',
      suggestedRating: 'got_it',
      memoryNote: null,
    })
  })

  it('empty memoryNote becomes null', () => {
    const full = `ok${VERDICT_SENTINEL}{"verdict":"correct","suggestedRating":"got_it","memoryNote":"  "}`
    expect(parseTutorOutput(full).verdict?.memoryNote).toBeNull()
  })
})
