/**
 * Minimal Anki card-template renderer.
 *
 * An Anki card's front/back are NOT "field 0" and "field 1" — they're defined by
 * the notetype's templates (`qfmt`/`afmt`), which are HTML with `{{FieldName}}`
 * placeholders. Picking fields by position breaks for any deck whose first field
 * is, say, a frequency rank or id (front shows the number, the real question
 * lands on the back). Rendering the template is what Anki does and what makes
 * import correct.
 *
 * Scope: this is a "mustache-lite" subset sufficient for Basic (text) notetypes —
 * field substitution, the `{{FrontSide}}` reference, simple `{{#Field}}` /
 * `{{^Field}}` conditional sections, and field filters (`{{text:F}}`,
 * `{{hint:F}}`, `{{type:F}}`). Cloze and media are out of scope (filtered
 * upstream). Fields are substituted as their RAW (HTML) values; the caller
 * strips HTML on the final rendered string, matching Anki's order of operations.
 */

export interface CardTemplate {
  /** Template ordinal — matches a card's `ord` (template index for the note). */
  ord: number
  name: string
  /** Question (front) format string. */
  qfmt: string
  /** Answer (back) format string. */
  afmt: string
}

/** Render the front of a card from its template's question format. */
export function renderFront(
  qfmt: string,
  rawFields: Record<string, string>,
): string {
  return renderTemplate(qfmt, rawFields, '')
}

/**
 * Render the back of a card from its template's answer format.
 *
 * `{{FrontSide}}` is expanded to an empty string on purpose: our study UI shows
 * the front separately and then reveals the back, so the conventional
 * `{{FrontSide}}<hr>{{Back}}` answer template should yield just the answer, not
 * the question repeated.
 */
export function renderBack(
  afmt: string,
  rawFields: Record<string, string>,
): string {
  return renderTemplate(afmt, rawFields, '')
}

function renderTemplate(
  template: string,
  fields: Record<string, string>,
  frontSide: string,
): string {
  let out = template

  // {{FrontSide}} — expand before generic field substitution.
  out = out.replace(/\{\{FrontSide\}\}/g, frontSide)

  // Conditional sections. Non-nested is enough for Basic notetypes.
  //   {{#Field}}...{{/Field}}  → keep inner only if Field is non-empty
  //   {{^Field}}...{{/Field}}  → keep inner only if Field is empty
  out = out.replace(
    /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, name: string, inner: string) =>
      isNonEmpty(fields, name.trim()) ? inner : '',
  )
  out = out.replace(
    /\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, name: string, inner: string) =>
      isNonEmpty(fields, name.trim()) ? '' : inner,
  )

  // Field substitution, tolerating filter prefixes (text:, hint:, type:, …).
  out = out.replace(/\{\{([^#^/][^}]*)\}\}/g, (_, raw: string) => {
    const name = fieldName(raw)
    return fields[name] ?? ''
  })

  return out
}

/** Strip any filter prefixes (`text:`, `hint:`, `type:cloze:` …) from a ref. */
function fieldName(raw: string): string {
  const trimmed = raw.trim()
  const colon = trimmed.lastIndexOf(':')
  return (colon === -1 ? trimmed : trimmed.slice(colon + 1)).trim()
}

function isNonEmpty(fields: Record<string, string>, name: string): boolean {
  const v = fields[name]
  return typeof v === 'string' && v.trim() !== ''
}
