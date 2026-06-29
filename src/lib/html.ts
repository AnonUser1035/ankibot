/**
 * Anki fields are HTML. For v1 we render plaintext only, so we extract the text
 * content and drop tags (including any <img>, which simply contributes no text).
 */
export function stripHtml(html: string): string {
  if (!html) return ''

  // Convert line-break-ish tags to spaces so words don't fuse together.
  const withBreaks = html.replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, ' ')

  let text: string
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
    text = doc.body.textContent ?? ''
  } else {
    // Node fallback (no DOM): strip tags, then decode a few common entities.
    text = withBreaks
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }

  // Drop Anki media markup that isn't HTML: [sound:foo.mp3] audio/video refs.
  text = text.replace(/\[sound:[^\]]*\]/gi, ' ')

  // Collapse runs of whitespace to single spaces.
  return text.replace(/\s+/g, ' ').trim()
}
