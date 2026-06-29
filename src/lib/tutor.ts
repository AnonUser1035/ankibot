/**
 * The `tutor` seam — the ONLY frontend module that knows a model/proxy exists.
 *
 * Everything else (the chat UI) calls `respond()` and consumes plain text
 * chunks; it never sees the worker URL, the model id, the system prompt, or the
 * SSE wire format. That isolation is deliberate: a future BYO-key branch (call
 * Anthropic directly from the browser, phase 7) or a model swap becomes a change
 * *here*, not a rewrite of the UI.
 *
 * Pure tutoring I/O. This module does NOT import or touch SRS, review state, or
 * persistence — the AI is additive in this phase and never grades or reschedules.
 */
import type { Card } from '../types/deck'

/** A single chat turn, as the UI tracks the visible conversation. */
export interface TutorTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface TutorRequest {
  /** The card currently being studied. */
  card: Card
  /** Recent visible turns (we trim + send only a few — see RECENT_TURNS). */
  recentTurns: TutorTurn[]
  /** Abort the in-flight request (e.g. the user moved to the next card). */
  signal?: AbortSignal
}

/** A typed, user-facing tutor failure. */
export class TutorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TutorError'
  }
}

/** Default model (decision 2). Swapping it is a one-line change here. */
const MODEL = 'claude-haiku-4-5-20251001'

/**
 * How many recent turns to send. The API is stateless and we control context;
 * keeping it tight holds cost down (decision 4: per-card scope already keeps
 * conversations short, this caps the tail of a long single-card exchange).
 */
const RECENT_TURNS = 8

/**
 * A fixed opening user turn. The Messages API requires the conversation to
 * start with a `user` message; this represents "the learner has arrived at this
 * card" so the tutor can open proactively (decision 3) without the UI inventing
 * a visible user message. It's prepended internally, never shown in the chat.
 */
const KICKOFF = "I'm looking at this flashcard. Walk me through it."

const WORKER_URL = import.meta.env.VITE_TUTOR_WORKER_URL

/** Whether the tutor is wired up. When false, the UI hides the chat gracefully. */
export function isTutorConfigured(): boolean {
  return typeof WORKER_URL === 'string' && WORKER_URL.length > 0
}

/**
 * Stream the tutor's reply as text chunks. Assembles the system prompt + recent
 * turns, calls the Worker, and yields each token-sized piece as it arrives.
 */
export async function* respond(req: TutorRequest): AsyncGenerator<string> {
  if (!WORKER_URL) {
    throw new TutorError('The AI tutor is not configured for this build.')
  }

  const body = JSON.stringify({
    model: MODEL,
    system: systemPrompt(req.card),
    messages: buildMessages(req.recentTurns),
  })

  let res: Response
  try {
    res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
    throw new TutorError("Couldn't reach the tutor. Check your connection.")
  }

  if (!res.ok || !res.body) {
    throw new TutorError(await errorFromResponse(res))
  }

  yield* readSse(res.body, req.signal)
}

/**
 * Prepend the internal kickoff so the sequence always starts with `user`, then
 * append the (trimmed) visible turns. Consecutive same-role messages are fine —
 * the API merges them — so trimming never produces an invalid sequence.
 */
function buildMessages(turns: TutorTurn[]): TutorTurn[] {
  const recent = turns.slice(-RECENT_TURNS)
  return [{ role: 'user', content: KICKOFF }, ...recent]
}

/**
 * The tutor's role. Friendly, concise, works through ONE card. Explicitly does
 * NOT grade or decide right/wrong this phase — it only converses (the
 * verdict→rating bridge is phase 6).
 */
function systemPrompt(card: Card): string {
  return [
    'You are a warm, concise study tutor helping a learner work through ONE flashcard at a time.',
    '',
    'The current flashcard:',
    `- Prompt (front): ${card.front}`,
    `- Answer (back): ${card.back}`,
    '',
    'How to help:',
    '- Open by engaging the learner with this card — pose the question or offer a quick way in. One or two sentences.',
    "- React to what they say: if they're close, affirm and sharpen it; if they're off, give a gentle hint before revealing the answer.",
    '- Offer short explanations and memory hooks when useful. Stay on THIS card only.',
    '',
    'Boundaries:',
    "- You do NOT grade, score, or declare pass/fail. You're here to converse and help them learn, not to judge — a separate part of the app handles scoring.",
    '- Be encouraging but brief. No markdown headings; short paragraphs, or a tiny list at most.',
  ].join('\n')
}

/** Pull a useful message out of a non-OK proxy response. */
async function errorFromResponse(res: Response): Promise<string> {
  if (res.status === 429) return 'The tutor is busy (rate limited). Try again in a moment.'
  const text = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(text)
    const msg = parsed?.error?.message ?? parsed?.error
    if (typeof msg === 'string') return msg
  } catch {
    /* fall through */
  }
  return `The tutor hit an error (${res.status}).`
}

/**
 * Parse the Anthropic SSE stream and yield text deltas. We only care about
 * `content_block_delta` events carrying a `text_delta`; framing events
 * (message_start/stop, ping, etc.) are ignored, and an `error` event throws.
 */
async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE lines are newline-delimited; keep the trailing partial line.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data) continue

        let evt: SseEvent
        try {
          evt = JSON.parse(data)
        } catch {
          continue
        }

        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          if (typeof evt.delta.text === 'string') yield evt.delta.text
        } else if (evt.type === 'error') {
          throw new TutorError(evt.error?.message ?? 'The tutor hit an error.')
        }
      }
    }
  } catch (err) {
    if (signal?.aborted || (err as Error)?.name === 'AbortError') return
    if (err instanceof TutorError) throw err
    throw new TutorError('The tutor stream was interrupted.')
  } finally {
    reader.releaseLock()
  }
}

interface SseEvent {
  type?: string
  delta?: { type?: string; text?: string }
  error?: { message?: string }
}
