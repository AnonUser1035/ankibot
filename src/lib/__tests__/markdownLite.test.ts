import { describe, expect, it } from 'vitest'
import { type Block, parseInline, parseMessage } from '../markdownLite'

describe('parseInline', () => {
  it('renders bold', () => {
    expect(parseInline('the **answer** is here')).toEqual([
      { type: 'text', value: 'the ' },
      { type: 'bold', value: 'answer' },
      { type: 'text', value: ' is here' },
    ])
  })

  it('renders italics with either delimiter', () => {
    expect(parseInline('say *bonjour*')).toEqual([
      { type: 'text', value: 'say ' },
      { type: 'italic', value: 'bonjour' },
    ])
    expect(parseInline('say _hola_')).toEqual([
      { type: 'text', value: 'say ' },
      { type: 'italic', value: 'hola' },
    ])
  })

  it('renders inline code, even when it contains an asterisk', () => {
    expect(parseInline('type `a*b` exactly')).toEqual([
      { type: 'text', value: 'type ' },
      { type: 'code', value: 'a*b' },
      { type: 'text', value: ' exactly' },
    ])
  })

  it('prefers bold over italic at a `**` boundary', () => {
    expect(parseInline('**x**')).toEqual([{ type: 'bold', value: 'x' }])
  })

  it('leaves an unmatched marker as literal text', () => {
    expect(parseInline('a lone * asterisk')).toEqual([
      { type: 'text', value: 'a lone * asterisk' },
    ])
  })

  it('treats partial (streaming) bold as literal until it closes', () => {
    expect(parseInline('the **par')).toEqual([{ type: 'text', value: 'the **par' }])
    // ...and resolves once the closing marker arrives.
    expect(parseInline('the **part**')).toEqual([
      { type: 'text', value: 'the ' },
      { type: 'bold', value: 'part' },
    ])
  })

  it('does not interpret tag-like text as markup (escaping is React’s job)', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { type: 'text', value: '<script>alert(1)</script>' },
    ])
  })
})

describe('parseMessage', () => {
  it('keeps soft line breaks within a paragraph', () => {
    const blocks = parseMessage('line one\nline two')
    expect(blocks).toEqual<Block[]>([
      {
        type: 'p',
        lines: [
          [{ type: 'text', value: 'line one' }],
          [{ type: 'text', value: 'line two' }],
        ],
      },
    ])
  })

  it('splits paragraphs on blank lines', () => {
    const blocks = parseMessage('one\n\ntwo')
    expect(blocks.map((b) => b.type)).toEqual(['p', 'p'])
  })

  it('groups consecutive bullets into one unordered list', () => {
    const blocks = parseMessage('- alpha\n- beta')
    expect(blocks).toEqual<Block[]>([
      {
        type: 'ul',
        items: [[{ type: 'text', value: 'alpha' }], [{ type: 'text', value: 'beta' }]],
      },
    ])
  })

  it('recognizes ordered lists', () => {
    const blocks = parseMessage('1. first\n2. second')
    expect(blocks[0].type).toBe('ol')
    expect(blocks[0].type === 'ol' && blocks[0].items.length).toBe(2)
  })

  it('downgrades heading markup to plain paragraph text', () => {
    const blocks = parseMessage('# Big Heading')
    expect(blocks).toEqual<Block[]>([
      { type: 'p', lines: [[{ type: 'text', value: 'Big Heading' }]] },
    ])
  })

  it('drops standalone code-fence lines', () => {
    const blocks = parseMessage('```\nplain\n```')
    expect(blocks).toEqual<Block[]>([
      { type: 'p', lines: [[{ type: 'text', value: 'plain' }]] },
    ])
  })

  it('parses inline emphasis inside list items', () => {
    const blocks = parseMessage('- the **key** term')
    expect(blocks).toEqual<Block[]>([
      {
        type: 'ul',
        items: [
          [
            { type: 'text', value: 'the ' },
            { type: 'bold', value: 'key' },
            { type: 'text', value: ' term' },
          ],
        ],
      },
    ])
  })

  it('never throws on empty input', () => {
    expect(parseMessage('')).toEqual([])
  })
})
