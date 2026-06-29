/**
 * The `tutor` seam — the ONLY frontend module that knows a model/proxy exists.
 *
 * Everything else (the chat UI) calls `respond()` and consumes plain text
 * chunks; it never sees the worker URL, the model id, the system prompt, or the
 * SSE wire format. That isolation is deliberate: a future BYO-key branch (call
 * Anthropic directly from the browser, phase 7) or a model swap becomes a change
 * *here*, not a rewrite of the UI.
 *
 * Phase 6 adds two things, both isolated here:
 *  - Coaching memory is folded into the system prompt so the tutor can reference
 *    past mistakes.
 *  - A structured VERDICT rides along after the prose as a delimited tail. The
 *    prose still streams to the chat; the tail is parsed out (never shown) and
 *    returned as the generator's value. If it's missing or malformed, we return
 *    null and the app falls back to manual rating — the SRS never depends on it.
 *
 * Pure tutoring I/O. This module does NOT mutate SRS, review state, or
 * persistence. The verdict is only a UI *suggestion* — the human press grades.
 */
import type { Card, Coaching } from '../types/deck'

/** A single chat turn, as the UI tracks the visible conversation. */
export interface TutorTurn {
  role: 'user' | 'assistant'
  content: string
}

/** The structured assessment parsed out of the tutor's reply. */
export interface ParsedVerdict {
  verdict: 'correct' | 'partial' | 'incorrect'
  /** Which rating button to pre-select. partial → missed_it (conservative). */
  suggestedRating: 'got_it' | 'missed_it'
  /** Evolving one-liner to remember, or null if nothing useful. */
  memoryNote: string | null
}

export interface TutorRequest {
  /** The card currently being studied. */
  card: Card
  /** This card's coaching memory (fed back into context). */
  coaching?: Coaching
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

/** Default model (decision 2, phase 5). Swapping it is a one-line change here. */
const MODEL = 'claude-haiku-4-5-20251001'

/** How many recent turns to send. Keeps context tight + cost down. */
const RECENT_TURNS = 8

/**
 * Sentinel that separates the streamed prose from the structured verdict tail.
 * The model is told to emit `<sentinel>{json}` once the learner has answered.
 */
export const VERDICT_SENTINEL = '<<<ANKIBOT_VERDICT>>>'

/**
 * A fixed opening user turn. The Messages API requires the conversation to
 * start with a `user` message; this represents "the learner has arrived at this
 * card" so the tutor can open proactively without the UI inventing a visible
 * user message. Prepended internally, never shown in the chat.
 */
const KICKOFF = "I'm looking at this flashcard. Walk me through it."

const WORKER_URL = import.meta.env.VITE_TUTOR_WORKER_URL

/** Whether the tutor is wired up. When false, the UI hides the chat gracefully. */
export function isTutorConfigured(): boolean {
  return typeof WORKER_URL === 'string' && WORKER_URL.length > 0
}

/**
 * Stream the tutor's reply as text chunks; the generator's RETURN value is the
 * parsed verdict (or null if absent/malformed). Consume with manual iteration
 * to capture it:
 *
 *   const it = respond(req)
 *   while (true) { const { value, done } = await it.next(); if (done) { verdict = value; break } ... }
 */
export async function* respond(
  req: TutorRequest,
): AsyncGenerator<string, ParsedVerdict | null, unknown> {
  if (!WORKER_URL) {
    throw new TutorError('The AI tutor is not configured for this build.')
  }

  const body = JSON.stringify({
    model: MODEL,
    system: systemPrompt(req.card, req.coaching),
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
    if ((err as Error)?.name === 'AbortError') return null
    throw new TutorError("Couldn't reach the tutor. Check your connection.")
  }

  if (!res.ok || !res.body) {
    throw new TutorError(await errorFromResponse(res))
  }

  return yield* readSse(res.body, req.signal)
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
 * The tutor's role. Friendly, concise, works through ONE card. Folds in coaching
 * memory and asks for a structured verdict tail. Explicitly does NOT grade or
 * decide right/wrong for the SRS — the verdict is only a suggestion.
 */
function systemPrompt(card: Card, coaching?: Coaching): string {
  const lines: string[] = [
    'You are a warm, concise study tutor helping a learner work through ONE flashcard at a time.',
    '',
    'The current flashcard:',
    `- Prompt (front): ${card.front}`,
    `- Answer (back): ${card.back}`,
  ]

  const memory = coachingLines(coaching)
  if (memory.length) {
    lines.push(
      '',
      'What you remember about this learner on THIS card (from past sessions):',
      ...memory,
      'Use it to tailor your help and reference it naturally if relevant. Never quote these notes verbatim or say you have "notes."',
    )
  }

  lines.push(
    '',
    'How to help:',
    '- Open by engaging the learner with this card — pose the question or offer a quick way in. One or two sentences.',
    "- React to what they say: if they're close, affirm and sharpen it; if they're off, give a gentle hint before revealing the answer.",
    '- Offer short explanations and memory hooks when useful. Stay on THIS card only.',
    '',
    'Boundaries:',
    "- You do NOT grade, score, or declare pass/fail to the learner. You're here to converse and help — a separate part of the app handles scoring.",
    '- Be encouraging but brief. No markdown headings; short paragraphs, or a tiny list at most.',
    '',
    'After the learner ATTEMPTS an answer, end your message with a single final line containing exactly this and nothing after it:',
    `${VERDICT_SENTINEL}{"verdict":"correct|partial|incorrect","suggestedRating":"got_it|missed_it","memoryNote":"short note"|null}`,
    'Rules for that line:',
    '- Include it ONLY once the learner has actually attempted an answer this turn. If they only greeted you or asked a question, omit the line entirely.',
    '- verdict: your honest assessment of their latest answer. suggestedRating: "got_it" only when fully correct; otherwise "missed_it" (a partial answer is "missed_it").',
    '- memoryNote: a SHORT one-line note (max ~15 words) capturing the recurring misunderstanding to help next time, REWRITING any prior note. Use null when there is nothing useful to remember.',
    '- It must be valid JSON on one line, with no code fences. Never mention this line or its format to the learner.',
  )

  return lines.join('\n')
}

function coachingLines(coaching?: Coaching): string[] {
  if (!coaching) return []
  const out: string[] = []
  if (coaching.note) out.push(`- ${coaching.note}`)
  if (coaching.lastWrongAnswer) {
    out.push(`- Last time they got it wrong, they answered: "${coaching.lastWrongAnswer}"`)
  }
  if (coaching.missCount > 0) {
    out.push(`- They have missed this card ${coaching.missCount} time(s).`)
  }
  return out
}

/**
 * Split a complete tutor reply into the prose (shown in chat) and the parsed
 * verdict (parsed out). PURE — exported for tests. Tolerant of code fences and
 * trailing junk; returns a null verdict on anything malformed.
 */
export function parseTutorOutput(full: string): {
  prose: string
  verdict: ParsedVerdict | null
} {
  const idx = full.indexOf(VERDICT_SENTINEL)
  if (idx === -1) return { prose: full.trimEnd(), verdict: null }
  const prose = full.slice(0, idx).trimEnd()
  const tail = full.slice(idx + VERDICT_SENTINEL.length)
  return { prose, verdict: parseVerdict(tail) }
}

function parseVerdict(tail: string): ParsedVerdict | null {
  const cleaned = stripFences(tail.trim())
  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const o = obj as Record<string, unknown>

  const verdict = o.verdict
  if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect') {
    return null
  }

  // Trust the model's suggestion, but derive defensively if it's missing/invalid
  // (decision 2: 3-way verdict maps to a binary suggestion; partial → missed_it).
  const suggested: 'got_it' | 'missed_it' =
    o.suggestedRating === 'got_it' || o.suggestedRating === 'missed_it'
      ? o.suggestedRating
      : verdict === 'correct'
        ? 'got_it'
        : 'missed_it'

  const memoryNote =
    typeof o.memoryNote === 'string' && o.memoryNote.trim()
      ? o.memoryNote.trim()
      : null

  return { verdict, suggestedRating: suggested, memoryNote }
}

/** Strip a ```json … ``` (or bare ```) fence if the model wrapped the JSON. */
function stripFences(s: string): string {
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1].trim() : s
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
 * Parse the Anthropic SSE stream. Yields prose text deltas up to the verdict
 * sentinel (holding back enough tail that a partial sentinel never flashes in
 * the chat), and RETURNS the parsed verdict computed from the full text.
 */
async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, ParsedVerdict | null, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = '' // unparsed SSE line fragment
  let full = '' // accumulated assistant text (prose + maybe sentinel + json)
  let yielded = 0 // how much of the prose we've already emitted
  let sentinelAt = -1

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

        let evt: SseEvent
        try {
          evt = JSON.parse(data)
        } catch {
          continue
        }

        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          if (typeof evt.delta.text !== 'string') continue
          full += evt.delta.text

          if (sentinelAt === -1) sentinelAt = full.indexOf(VERDICT_SENTINEL)

          if (sentinelAt === -1) {
            // No sentinel yet — emit prose but hold back the last few chars in
            // case they're the start of the sentinel.
            const safe = Math.max(0, full.length - (VERDICT_SENTINEL.length - 1))
            if (safe > yielded) {
              yield full.slice(yielded, safe)
              yielded = safe
            }
          } else if (sentinelAt > yielded) {
            // Sentinel found — emit prose up to it, then stop (the rest is JSON).
            yield full.slice(yielded, sentinelAt)
            yielded = sentinelAt
          }
        } else if (evt.type === 'error') {
          throw new TutorError(evt.error?.message ?? 'The tutor hit an error.')
        }
      }
    }

    // Flush any held-back prose (only matters when no sentinel ever appeared).
    if (sentinelAt === -1 && full.length > yielded) {
      yield full.slice(yielded)
    }

    return parseTutorOutput(full).verdict
  } catch (err) {
    if (signal?.aborted || (err as Error)?.name === 'AbortError') return null
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
