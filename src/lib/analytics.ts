// Thin, typed wrapper around gtag.js (loaded in index.html for the ankibot GA4
// property). Everything degrades to a no-op when gtag isn't present — e.g. the
// script is blocked, or in tests — so callers never have to guard.

type GtagFn = (command: string, ...args: unknown[]) => void

function gtag(): GtagFn | null {
  const fn = (window as unknown as { gtag?: GtagFn }).gtag
  return typeof fn === 'function' ? fn : null
}

/** A distinct screen in the SPA. Reported as a virtual page_view. */
export type View = 'landing' | 'deck' | 'study' | 'summary'

const VIEW_PATHS: Record<View, { path: string; title: string }> = {
  landing: { path: '/', title: 'ankibot — landing' },
  deck: { path: '/deck', title: 'ankibot — deck' },
  study: { path: '/study', title: 'ankibot — study' },
  summary: { path: '/summary', title: 'ankibot — summary' },
}

/** Send a virtual pageview when the user moves between SPA views. */
export function trackPageView(view: View): void {
  const g = gtag()
  if (!g) return
  const { path, title } = VIEW_PATHS[view]
  g('event', 'page_view', { page_path: path, page_title: title })
}

/** Send a custom event. Params are passed through to GA4 verbatim. */
export function track(event: string, params?: Record<string, unknown>): void {
  const g = gtag()
  if (!g) return
  g('event', event, params)
}
