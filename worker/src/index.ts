/**
 * ankibot tutor proxy — a stateless Cloudflare Worker.
 *
 * Holds the Anthropic API key (a Worker secret) so it never ships in the
 * frontend bundle. The browser POSTs a chat request; the Worker adds the key +
 * required headers, calls the Messages API with streaming on, and pipes the SSE
 * stream straight back. It stores no user progress.
 *
 * Phase 7 adds a real, GLOBAL monthly spend cap (there are no accounts, so one
 * ceiling on *your* spend) backed by Cloudflare KV, metered from the actual
 * token usage in the streamed response. When the cap is hit it refuses with a
 * friendly message inviting the user to bring their own key (which calls
 * Anthropic directly from the browser and bypasses this Worker entirely).
 *
 * Wire details verified against the official streaming docs: POST
 * https://api.anthropic.com/v1/messages, `anthropic-version: 2023-06-01`,
 * `"stream": true`; streamed text/usage arrive as SSE events.
 */

export interface Env {
  /** Anthropic API key — set as a Worker SECRET, never committed. */
  ANTHROPIC_API_KEY: string
  /** Comma-separated origin allow-list (optional; falls back to defaults). */
  ALLOWED_ORIGINS?: string
  /** Global monthly token budget (optional; defaults below). Set in wrangler.toml. */
  MONTHLY_TOKEN_BUDGET?: string
  /** KV namespace for the usage counter. Bound in wrangler.toml as USAGE. */
  USAGE?: KVNamespace
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const ALLOWED_MODELS = new Set([DEFAULT_MODEL, 'claude-haiku-4-5'])
const MAX_TOKENS = 1024

const DEFAULT_MONTHLY_TOKEN_BUDGET = 2_000_000 // ~$5/mo on Haiku; Ryan can override

const DEFAULT_ALLOWED_ORIGINS = [
  'https://ankibot.ryanbohluli.com',
  'http://localhost:3000',
  'http://localhost:5173',
]

// --- minimal per-IP rate limit (kept from phase 5; the cap below is the real
// spend guard). In-memory + per-isolate: best-effort, resets on cold starts.
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

function budget(env: Env): number {
  const n = Number(env.MONTHLY_TOKEN_BUDGET)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_TOKEN_BUDGET
}

/** KV key for the current calendar month, e.g. "usage:2026-06". `now` injected. */
function usageKey(now: Date): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `usage:${y}-${m}`
}

async function readUsage(env: Env, key: string): Promise<number> {
  if (!env.USAGE) return 0
  const raw = await env.USAGE.get(key)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

/** Best-effort increment. KV is eventually consistent — fine for a soft cap. */
async function addUsage(env: Env, key: string, tokens: number): Promise<void> {
  if (!env.USAGE || tokens <= 0) return
  const current = await readUsage(env, key)
  // ~63-day TTL so old months self-expire.
  await env.USAGE.put(key, String(current + tokens), { expirationTtl: 60 * 60 * 24 * 63 })
}

function allowedOrigins(env: Env): Set<string> {
  const configured = env.ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

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

function json(body: unknown, status: number, cors: Headers): Response {
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = allowedOrigins(env)
    const cors = corsHeaders(origin, allowed)

    if (request.method === 'OPTIONS') {
      if (!origin || !allowed.has(origin)) {
        return new Response('Origin not allowed', { status: 403 })
      }
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors)
    }

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

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (rateLimited(ip, Date.now())) {
      const h = new Headers(cors)
      h.set('Retry-After', '60')
      return json({ error: 'Too many requests. Slow down a moment.' }, 429, h)
    }

    // Global monthly spend cap. Soft block: if this month's metered usage is at
    // or above the budget, refuse before calling Anthropic and invite BYO key.
    const key = usageKey(new Date())
    if ((await readUsage(env, key)) >= budget(env)) {
      return json(
        {
          error: {
            code: 'cap_reached',
            message:
              "The shared monthly AI budget has been used up. Add your own Anthropic API key in the app's tutor settings to keep going — it calls Anthropic directly from your browser and isn't subject to this cap.",
          },
        },
        402,
        cors,
      )
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

    // Mark the system prompt cacheable (prompt caching — cuts input cost on
    // repeated turns where the prefix is large enough to meet the model minimum).
    const upstreamBody = JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: [
        { type: 'text', text: payload.system, cache_control: { type: 'ephemeral' } },
      ],
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

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      const h = new Headers(cors)
      h.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
      return new Response(text || JSON.stringify({ error: 'Upstream error.' }), {
        status: upstream.status || 502,
        headers: h,
      })
    }

    // Tee the stream: one branch streams to the client untouched (no buffering),
    // the other is metered in the background to update the monthly usage counter.
    const [clientStream, meterStream] = upstream.body.tee()
    ctx.waitUntil(meterUsage(meterStream, env, key))

    const h = new Headers(cors)
    h.set('Content-Type', upstream.headers.get('Content-Type') ?? 'text/event-stream')
    h.set('Cache-Control', 'no-store')
    return new Response(clientStream, { status: 200, headers: h })
  },
}

/**
 * Read the SSE stream off-band and extract token usage from `message_start`
 * (input + cache tokens) and `message_delta` (output). Updates the KV counter.
 * Any parse failure falls back to a nominal increment so the cap still advances.
 */
async function meterUsage(
  stream: ReadableStream<Uint8Array>,
  env: Env,
  key: string,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let input = 0
  let output = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data) continue
        try {
          const evt = JSON.parse(data)
          const u = evt?.message?.usage ?? evt?.usage
          if (u) {
            if (typeof u.input_tokens === 'number') input = u.input_tokens
            if (typeof u.cache_creation_input_tokens === 'number') {
              input += u.cache_creation_input_tokens
            }
            if (typeof u.cache_read_input_tokens === 'number') {
              input += u.cache_read_input_tokens
            }
            if (typeof u.output_tokens === 'number') output = u.output_tokens
          }
        } catch {
          /* ignore non-JSON lines */
        }
      }
    }
  } catch {
    /* swallow — metering must never affect the user's stream */
  } finally {
    reader.releaseLock()
  }
  const total = input + output
  await addUsage(env, key, total > 0 ? total : 500)
}
