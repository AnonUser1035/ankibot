/**
 * A deliberately tiny markdown subset for examiner chat messages.
 *
 * Why this exists: the examiner emits a *constrained* set of emphasis (bold,
 * italic, inline code, short lists — see the Formatting block in tutor.ts), and
 * the chat used to print it raw, so `**term**` showed up as literal asterisks.
 * This parser turns ONLY that allowed subset into a structured tree the UI
 * renders as React elements (never an HTML string — see FormattedMessage.tsx),
 * which makes raw-HTML/script injection structurally impossible.
 *
 * Everything outside the subset (headings, links, images, blockquotes, tables,
 * code fences, raw HTML) is downgraded to plain text rather than rendered. The
 * parser is PURE and total: it never throws, and unmatched/partial markup (e.g.
 * a streamed `**par` whose closing `**` has not arrived yet) is left as literal
 * text until it completes. Exported for unit tests.
 */

/** An inline run within a single line. */
export type Inline =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }

/** A block-level element. Paragraph lines are separated by soft line breaks. */
export type Block =
  | { type: 'p'; lines: Inline[][] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; items: Inline[][] }

/**
 * Matches, in priority order: inline code, bold, then italic (`*` or `_`).
 * Code is greedy-but-line-bounded so a literal may contain `*`. Bold/italic are
 * lazy and require a closing delimiter, so a lone/partial marker simply never
 * matches and falls through as literal text — the key to streaming safety.
 */
const INLINE_RE = /(`[^`\n]+`)|(\*\*[^\n]+?\*\*)|(\*[^*\n]+?\*)|(_[^_\n]+?_)/

/** Parse a single line's text into inline runs. Never throws. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  // Re-create per call: this regex is used with .match (no global state), so a
  // simple loop that slices past each match is both correct and total.
  for (;;) {
    const m = rest.match(INLINE_RE)
    if (!m || m.index === undefined) {
      if (rest) out.push({ type: 'text', value: rest })
      break
    }
    if (m.index > 0) out.push({ type: 'text', value: rest.slice(0, m.index) })
    const [whole, code, bold, starItalic, underscoreItalic] = m
    if (code !== undefined) {
      out.push({ type: 'code', value: code.slice(1, -1) })
    } else if (bold !== undefined) {
      out.push({ type: 'bold', value: bold.slice(2, -2) })
    } else if (starItalic !== undefined) {
      out.push({ type: 'italic', value: starItalic.slice(1, -1) })
    } else if (underscoreItalic !== undefined) {
      out.push({ type: 'italic', value: underscoreItalic.slice(1, -1) })
    }
    rest = rest.slice(m.index + whole.length)
  }
  return out
}

/** A line that opens an unordered list item: `- `, `* `, or `+ `. */
const UL_RE = /^\s*[-*+]\s+(.*)$/
/** A line that opens an ordered list item: `1. `, `2) `, etc. */
const OL_RE = /^\s*\d+[.)]\s+(.*)$/
/** ATX heading markers (`#`..`######`) — downgraded to plain text. */
const HEADING_RE = /^\s*#{1,6}\s+(.*)$/
/** A standalone code-fence line — dropped (fences are not supported). */
const FENCE_RE = /^\s*```/

/**
 * Parse a full message into block elements. Blank lines separate paragraphs;
 * consecutive `-`/`*`/`+` or `1.` lines form a list. Heading markers are
 * stripped to plain text and fence lines are dropped. Never throws.
 */
export function parseMessage(input: string): Block[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: Inline[][] | null = null

  const flushPara = () => {
    if (para && para.length) blocks.push({ type: 'p', lines: para })
    para = null
  }

  for (const raw of lines) {
    if (FENCE_RE.test(raw)) {
      // Drop the fence line itself; any text inside fences still renders as
      // ordinary paragraph lines (the model is told not to use fences anyway).
      continue
    }
    if (raw.trim() === '') {
      flushPara()
      continue
    }

    const ul = raw.match(UL_RE)
    const ol = ul ? null : raw.match(OL_RE)
    if (ul || ol) {
      flushPara()
      const type = ul ? 'ul' : 'ol'
      const item = parseInline((ul ?? ol!)[1])
      const last = blocks[blocks.length - 1]
      if (last && last.type === type) {
        last.items.push(item)
      } else {
        blocks.push(
          type === 'ul' ? { type: 'ul', items: [item] } : { type: 'ol', items: [item] },
        )
      }
      continue
    }

    const heading = raw.match(HEADING_RE)
    const lineText = heading ? heading[1] : raw
    ;(para ??= []).push(parseInline(lineText))
  }

  flushPara()
  return blocks
}
