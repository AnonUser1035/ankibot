import { Fragment } from 'react'
import { type Inline, parseMessage } from '../lib/markdownLite'

/**
 * Renders an examiner message's constrained markdown subset (bold, italic,
 * inline code, soft line breaks, short lists) as React elements.
 *
 * It returns React nodes — never an HTML string and never via
 * dangerouslySetInnerHTML — so any tag-like text in the model output is treated
 * as literal, escaped text. See markdownLite.ts for the supported grammar.
 */
function renderInline(tokens: Inline[]) {
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'bold':
        return (
          <strong key={i} className="font-semibold">
            {t.value}
          </strong>
        )
      case 'italic':
        return (
          <em key={i} className="italic">
            {t.value}
          </em>
        )
      case 'code':
        return (
          <code
            key={i}
            className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/15"
          >
            {t.value}
          </code>
        )
      default:
        return <Fragment key={i}>{t.value}</Fragment>
    }
  })
}

/** Render a paragraph's lines, joining soft line breaks with <br>. */
function renderLines(lines: Inline[][]) {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ))
}

export function FormattedMessage({ content }: { content: string }) {
  const blocks = parseMessage(content)
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal space-y-0.5 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          )
        }
        return <p key={i}>{renderLines(block.lines)}</p>
      })}
    </div>
  )
}
