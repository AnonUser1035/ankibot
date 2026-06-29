/**
 * ankibot tutor proxy — a stateless Cloudflare Worker.
 *
 * It exists for exactly ONE reason: to hold the Anthropic API key so it never
 * ships in the frontend bundle. The browser POSTs a chat request here; the
 * Worker adds the secret key + required Anthropic headers, calls the Messages
 * API with streaming on, and pipes the SSE stream straight back to the browser.
 *
 * It stores NO user data and NO progress — secret-holder + forwarder only.
 *
 * Wire details verified against the official streaming docs (do not hardcode
 * from memory): POST https://api.anthropic.com/v1/messages, header
 * `anthropic-version: 2023-06-01`, `"stream": true` in the body; streamed text
 * arrives as `content_block_delta` events with a `text_delta`.
 */

export interface Env {
  /** Anthropic API key — set as a Worker SECRET, never committed. */
  ANTHROPIC_API_KEY: string
  /**
   * Comma-separated origin allow-list. Optional — falls back to the built-in
   * defaults (prod domain + localhost dev). Set in wrangler.toml [vars] or the
   * dashboard if the app moves.
   */
  ALLOWED_ORIGINS?: string
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/** Default model for this phase (decision 2). Pinned; the seam allows swaps. */
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
/** Models the proxy will forward. Keeps a public key from driving Opus, etc. */
const ALLOWED_MODELS = new Set([DEFAULT_MODEL, 'claude-haiku-4-5'])
/** Hard output cap — tutoring replies are short; this also caps cost per call. */
const MAX_TOKENS = 1024

const DEFAULT_ALLOWED_ORIGINS = [
  'https://ankibot.ryanbohluli.com',
  'http://localhost:3000', // vite dev (see vite.config.ts)
  'http://localhost:5173', // vite default, just in case
]

// --- minimal per-IP rate limit (decision: a basic abuse guard, NOT the real
// monthly cap — that's phase 7). In-memory + per-isolate, so it's best-effort:
// it survives within a warm isolate but resets on cold starts and isn't shared
// across edge locations. Good enough to stop casual hammering during dev.
const RATE_LIMIT = 20 // requests…
const RATE_WINDOW_MS = 60_000 // …per IP per minute
const hits = new Map<string, number[]>()

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

function allowedOrigins(env: Env): Set<string> {
  const configured = env.ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

/** CORS headers — only emits Allow-Origin when the origin is allow-listed. */
function corsHeaders(origin: string | null, allowed: Set<string>): Headers {
  const h = new Headers()
  if (origin && allowed.has(origin)) {
    h.set('Access-Control-Allow-Origin', origin)
    h.set('Vary', 'Origin')
    h.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    h.set('Access-Control-Allow-Headers', 'Content-Type')
    h.set('Access-Control-Max-Age', '86400')
  }
  return h
}

function json(
  body: unknown,
  status: number,
  cors: Headers,
): Response {
  const h = new Headers(cors)
  h.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers: h })
}

interface TutorPayload {
  system?: unknown
  messages?: unknown
  model?: unknown
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = allowedOrigins(env)
    const cors = corsHeaders(origin, allowed)

    // Preflight — the #1 thing that silently breaks cross-origin requests.
    if (request.method === 'OPTIONS') {
      if (!origin || !allowed.has(origin)) {
        return new Response('Origin not allowed', { status: 403 })
      }
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors)
    }

    // Origin allow-list (decision: basic abuse guard).
    if (!origin || !allowed.has(origin)) {
      return json({ error: 'Origin not allowed' }, 403, cors)
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json(
        { error: 'Server is missing its API key. Set the ANTHROPIC_API_KEY secret.' },
        500,
        cors,
      )
    }

    // Per-IP rate limit.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (rateLimited(ip, Date.now())) {
      const h = new Headers(cors)
      h.set('Retry-After', '60')
      return json({ error: 'Too many requests. Slow down a moment.' }, 429, h)
    }

    let payload: TutorPayload
    try {
      payload = (await request.json()) as TutorPayload
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400, cors)
    }

    if (typeof payload.system !== 'string' || !Array.isArray(payload.messages)) {
      return json({ error: 'Expected { system: string, messages: [] }.' }, 400, cors)
    }

    const model =
      typeof payload.model === 'string' && ALLOWED_MODELS.has(payload.model)
        ? payload.model
        : DEFAULT_MODEL

    // Build the upstream request. We construct it ourselves (not pass-through)
    // so the public proxy can't be coerced into arbitrary params/models/cost.
    const upstreamBody = JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: payload.system,
      messages: payload.messages,
    })

    let upstream: Response
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: upstreamBody,
      })
    } catch {
      return json({ error: 'Could not reach the model service.' }, 502, cors)
    }

    // On an upstream error, forward the body + status (with CORS) so the
    // browser sees a real message instead of an opaque failure.
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      const h = new Headers(cors)
      h.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
      return new Response(text || JSON.stringify({ error: 'Upstream error.' }), {
        status: upstream.status || 502,
        headers: h,
      })
    }

    // Pipe the SSE stream straight through — do NOT buffer; buffering kills the
    // live-typing feel. `upstream.body` is a ReadableStream handed to the client.
    const h = new Headers(cors)
    h.set('Content-Type', upstream.headers.get('Content-Type') ?? 'text/event-stream')
    h.set('Cache-Control', 'no-store')
    return new Response(upstream.body, { status: 200, headers: h })
  },
}
