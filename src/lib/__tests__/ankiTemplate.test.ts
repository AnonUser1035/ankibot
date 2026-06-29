import { describe, expect, it } from 'vitest'
import { renderBack, renderFront } from '../ankiTemplate'

const fields = {
  Rank: '1',
  Word: 'Bonjour',
  Meaning: 'Hello',
  Hint: '',
}

describe('renderFront / renderBack', () => {
  it('substitutes the referenced field, not field position', () => {
    expect(renderFront('{{Word}}', fields)).toBe('Bonjour')
  })

  it('expands {{FrontSide}} to empty so the back is just the answer', () => {
    // Conventional Basic answer template.
    expect(renderBack('{{FrontSide}}<hr id=answer>{{Meaning}}', fields)).toBe(
      '<hr id=answer>Hello',
    )
  })

  it('keeps {{#Field}} sections only when the field is non-empty', () => {
    expect(renderFront('{{Word}}{{#Meaning}} ({{Meaning}}){{/Meaning}}', fields)).toBe(
      'Bonjour (Hello)',
    )
    expect(renderFront('{{Word}}{{#Hint}} [{{Hint}}]{{/Hint}}', fields)).toBe('Bonjour')
  })

  it('keeps {{^Field}} sections only when the field is empty', () => {
    expect(renderFront('{{Word}}{{^Hint}} (no hint){{/Hint}}', fields)).toBe(
      'Bonjour (no hint)',
    )
    expect(renderFront('{{Word}}{{^Meaning}} (none){{/Meaning}}', fields)).toBe('Bonjour')
  })

  it('strips field filter prefixes (text:, hint:)', () => {
    expect(renderFront('{{text:Word}}', fields)).toBe('Bonjour')
    expect(renderFront('{{hint:Meaning}}', fields)).toBe('Hello')
  })

  it('renders an unknown field reference as empty', () => {
    expect(renderFront('{{Nope}}', fields)).toBe('')
  })
})
