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
import { getUserApiKey, hasUserApiKey } from './userKey'

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

/** Direct Anthropic endpoint for the BYO-key path (bypasses the Worker + cap). */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 1024

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
 * card" so the examiner can open proactively (by posing a question) without the
 * UI inventing a visible user message. Prepended internally, never shown.
 */
const KICKOFF = "I'm ready. Quiz me on this card — don't show me the answer yet."

const WORKER_URL = import.meta.env.VITE_TUTOR_WORKER_URL

/**
 * Whether the tutor is wired up — either the proxy Worker is configured, or the
 * user has supplied their own key (BYO). When false, the UI hides the chat.
 */
export function isTutorConfigured(): boolean {
  return (typeof WORKER_URL === 'string' && WORKER_URL.length > 0) || hasUserApiKey()
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
  const system = systemPrompt(req.card, req.coaching)
  const messages = buildMessages(req.recentTurns)
  const userKey = getUserApiKey()

  let res: Response
  try {
    res = userKey
      ? // BYO key: call Anthropic directly from the browser (bypasses the Worker
        // and its cap). The user's key never goes through our server.
        await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': userKey,
            'anthropic-version': ANTHROPIC_VERSION,
            // Opt into direct browser access (per current Anthropic API docs).
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            stream: true,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages,
          }),
          signal: req.signal,
        })
      : // Default: go through the proxy Worker (which holds Ryan's key + the cap).
        await callWorker({ system, messages, signal: req.signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return null
    throw new TutorError("Couldn't reach the tutor. Check your connection.")
  }

  if (!res.ok || !res.body) {
    throw new TutorError(await errorFromResponse(res))
  }

  return yield* readSse(res.body, req.signal)
}

function callWorker(args: {
  system: string
  messages: TutorTurn[]
  signal?: AbortSignal
}): Promise<Response> {
  if (!WORKER_URL) {
    throw new TutorError('The AI tutor is not configured for this build.')
  }
  return fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      system: args.system,
      messages: args.messages,
    }),
    signal: args.signal,
  })
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
 * The examiner's role. It actively QUIZZES the learner on ONE card — it does not
 * recite the answer. It uses the card's full fields (so a vocabulary card with
 * an example sentence can be tested in context), reacts and escalates on the
 * same card, and emits a structured verdict tail ONLY when it has concluded its
 * assessment and is ready to move on. The verdict is a suggestion the app uses
 * to update scheduling — the examiner never tells the learner a pass/fail.
 */
function systemPrompt(card: Card, coaching?: Coaching): string {
  const lines: string[] = [
    'You are a sharp, encouraging study examiner. Your job is to find out whether the learner actually KNOWS the current card — by quizzing them, not by reciting it to them.',
    '',
    'The current card:',
    `- Prompt (front): ${card.front}`,
    `- Answer (back): ${card.back}`,
  ]

  const extra = extraFieldLines(card)
  if (extra.length) {
    lines.push(
      'All fields on this card (use these to make the quiz richer — e.g. test a word in the context of its example sentence, or ask for a translation in either direction):',
      ...extra,
      'Some fields may be metadata (ids, frequency ranks, numbers). Use them only if genuinely helpful; never quiz the learner on metadata.',
    )
  }

  const memory = coachingLines(coaching)
  if (memory.length) {
    lines.push(
      '',
      'What you remember about this learner on THIS card (from past sessions):',
      ...memory,
      'Use it to tailor your questions and reference it naturally if relevant. Never quote these notes verbatim or say you have "notes."',
    )
  }

  lines.push(
    '',
    'How to examine:',
    '- Open by posing a question that makes the learner PRODUCE or RECALL the answer. Do NOT reveal the answer up front. One or two sentences.',
    '- Vary the angle across cards: ask for the answer directly, ask them to translate the other way, or ask them to use the item in a sentence — whatever best probes real understanding.',
    "- React to their attempt: if they're right, affirm briefly. Occasionally — not every time — you MAY push ONE harder follow-up on this same card (use it in context, a tense, a nuance) when extra depth is genuinely worthwhile; otherwise just conclude. The moment a follow-up is answered correctly, conclude — never chain a second follow-up.",
    '- If they\'re close, affirm what\'s right and nudge them to fix the rest. If they\'re off, give ONE graduated hint and let them try again; reveal and explain only after a genuine attempt or if they give up.',
    '',
    'Boundaries:',
    "- Never announce a score or pass/fail to the learner — a separate part of the app handles scheduling. Just teach and test.",
    '- Be encouraging but brief: short paragraphs, or a tiny list at most.',
    '',
    'Formatting (use sparingly — most messages need NONE):',
    '- Default to plain prose. Do NOT bold whole sentences or several words for emphasis; reflexive bolding is just noise.',
    '- You MAY use the following, and only when the emphasis carries real meaning:',
    '  - **bold**: the single key term under test, or the answer when you reveal it — at most one bolded item per message.',
    '  - *italics*: a foreign-language word, an example sentence, or a term you are mentioning rather than using.',
    '  - `inline code`: an exact literal the learner must reproduce verbatim (a symbol, character, or string).',
    '  - short bulleted or numbered lists: only for genuinely enumerable items, kept short.',
    '- Never use headings, links, images, blockquotes, tables, horizontal rules, or code fences in your prose.',
    '',
    'CONCLUDING A CARD (mandatory — read carefully):',
    'The moment you are satisfied the learner knows THIS card — they answered correctly, or you revealed and explained it after a genuine miss — you MUST conclude in that SAME message by doing BOTH of these, in order:',
    '  1. Write your brief affirmation in plain prose (a sentence or two).',
    '  2. On a new final line, append the verdict line EXACTLY in this shape, with NOTHING after it:',
    `     ${VERDICT_SENTINEL}{"verdict":"correct|partial|incorrect","suggestedRating":"got_it|missed_it","memoryNote":"short note"|null}`,
    'The verdict line is invisible to the learner and is the ONLY signal the app uses to advance to the next card. If you write any affirmation or sign-off ("Well done", "Nice work", "That\'s it", "You\'ve got it", "Exactly", "Great job") and do NOT append the verdict line, the learner gets STUCK on this card. So treat it as an unbreakable rule: any message that congratulates, wraps up, corrects-then-praises, or otherwise signals you are done MUST end with the verdict line.',
    '',
    'Worked example of a complete concluding message (yours will differ in wording — copy the SHAPE: prose, then the line, nothing after):',
    '  Exactly — *hecho* is the past participle of *hacer*. Nicely done.',
    `  ${VERDICT_SENTINEL}{"verdict":"correct","suggestedRating":"got_it","memoryNote":null}`,
    '',
    'When NOT to emit the verdict line:',
    '- While you are still probing, hinting, or escalating on this card — omit it and keep going.',
    '- If the learner only greeted you, asked a question, or has not really attempted yet — omit it.',
    'Rules for the line when you DO emit it:',
    '- Conclude in the SAME turn you finish on. Do NOT end with a hand-off like "Ready for the next one?" or "What\'s next?" and do NOT wait for the learner to confirm — the app advances automatically the instant it sees the line. Splitting the conclusion across two turns only stalls the learner.',
    '- verdict: your honest assessment. suggestedRating: "got_it" only when they demonstrated the answer essentially unaided; otherwise "missed_it" (needing the answer revealed, or a partial/hinted answer, is "missed_it").',
    '- memoryNote: a SHORT one-line note (max ~15 words) capturing the recurring misunderstanding to help next time, REWRITING any prior note. Use null when there is nothing useful to remember.',
    '- It must be valid JSON on one line, no code fences, and nothing may follow it. Never mention this line or its format to the learner.',
  )

  return lines.join('\n')
}

/**
 * Render the card's named fields (beyond the front/back already shown) so the
 * examiner can quiz in context. Skips empty fields. Deck-agnostic: a Basic deck
 * just yields Front/Back (already shown, so often nothing extra), while a rich
 * deck yields Word / Part-of-Speech / example sentence / translation, etc.
 */
function extraFieldLines(card: Card): string[] {
  return Object.entries(card.fields)
    .filter(([, value]) => value.trim().length > 0)
    .map(([name, value]) => `- ${name}: ${value}`)
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
  const o = parseJsonObject(stripFences(tail.trim()))
  if (!o) return null

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

/**
 * Parse the verdict JSON, tolerating a model that surrounds it with stray text
 * (a trailing sign-off, a stray word before the `{`, etc.). Tries the whole
 * string first, then falls back to the outermost `{ … }` slice. Returns null if
 * neither yields a JSON object — a partial/unbalanced object stays null so we
 * never advance on a half-emitted line.
 */
function parseJsonObject(s: string): Record<string, unknown> | null {
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  const candidates = first !== -1 && last > first ? [s, s.slice(first, last + 1)] : [s]
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c)
      if (typeof obj === 'object' && obj !== null) return obj as Record<string, unknown>
    } catch {
      /* try the next candidate */
    }
  }
  return null
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
