// Thin, typed wrapper around gtag.js for the ankibot GA4 property. gtag is
// bootstrapped by initAnalytics() (called from main.tsx) only when
// VITE_GA_MEASUREMENT_ID is set — so dev/preview builds without the var report
// nothing. Everything degrades to a no-op when gtag isn't present (var unset,
// script blocked, or in tests), so callers never have to guard.

type GtagFn = (command: string, ...args: unknown[]) => void

function gtag(): GtagFn | null {
  const fn = (window as unknown as { gtag?: GtagFn }).gtag
  return typeof fn === 'function' ? fn : null
}

/**
 * Load gtag.js and configure the GA4 property. No-op when the measurement ID
 * is unset. Auto page_view is disabled so the SPA can send virtual pageviews
 * on view changes (see trackPageView).
 */
export function initAnalytics(): void {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID
  if (!id) return

  const w = window as unknown as { dataLayer?: unknown[]; gtag?: GtagFn }
  w.dataLayer = w.dataLayer || []
  // gtag.js processes the dataLayer queue by inspecting each entry's `arguments`
  // object — a plain array (what a rest param produces) is read as a data push
  // and silently ignored, so config/events never fire. Mirror Google's
  // canonical snippet exactly and push `arguments`.
  const fn = function (): void {
    w.dataLayer!.push(arguments)
  } as unknown as GtagFn
  w.gtag = fn
  fn('js', new Date())
  fn('config', id, { send_page_view: false })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)
}

/** A distinct screen in the SPA. Reported as a virtual page_view. */
export type View = 'landing' | 'deck' | 'study' | 'chat' | 'summary'

const VIEW_PATHS: Record<View, { path: string; title: string }> = {
  landing: { path: '/', title: 'ankibot — landing' },
  deck: { path: '/deck', title: 'ankibot — deck' },
  study: { path: '/study', title: 'ankibot — study' },
  chat: { path: '/chat', title: 'ankibot — chat' },
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
