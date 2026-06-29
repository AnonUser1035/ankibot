import { useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import {
  type ParsedVerdict,
  type TutorTurn,
  TutorError,
  isTutorConfigured,
  respond,
} from '../lib/tutor'
import type { Card } from '../types/deck'

/**
 * Streaming AI chat alongside the current card.
 *
 * Scoped PER CARD: the parent mounts this with `key={card.id}`, so advancing the
 * card remounts it fresh — a new tutoring exchange with that card's coaching
 * memory. On mount the tutor opens proactively; the learner types; replies
 * stream in token-by-token.
 *
 * Phase 6: after the learner answers, the tutor returns a structured verdict
 * (parsed out of the reply, never shown). We surface it via `onVerdict` so the
 * card view can pre-select a rating button. This component never touches SRS.
 */
export function TutorChat({
  card,
  onVerdict,
}: {
  card: Card
  /** Called when a structured verdict is parsed. `lastAnswer` is the learner's
   *  most recent typed answer (for the deterministic coaching baseline). */
  onVerdict?: (verdict: ParsedVerdict, lastAnswer: string | undefined) => void
}) {
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // The conversation we last sent, so a mid-stream error can be retried.
  const lastHistoryRef = useRef<TutorTurn[]>([])

  // Proactive opener on mount (once per card — parent keys us by card.id).
  useEffect(() => {
    if (!isTutorConfigured()) return
    runTutor([])
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  /** Stream a tutor reply for the given conversation `history`. */
  function runTutor(history: TutorTurn[]) {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    lastHistoryRef.current = history

    setStreaming(true)
    setError(null)
    setTurns((t) => [...t, { role: 'assistant', content: '' }])

    void (async () => {
      let verdict: ParsedVerdict | null = null
      let any = false
      try {
        const it = respond({
          card,
          coaching: card.coaching,
          recentTurns: history,
          signal: ctrl.signal,
        })
        while (true) {
          const { value, done } = await it.next()
          if (done) {
            verdict = value
            break
          }
          any = true
          setTurns((t) => {
            const copy = t.slice()
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { role: 'assistant', content: last.content + value }
            return copy
          })
        }
        if (!any) setTurns((t) => t.slice(0, -1))
        if (verdict && !ctrl.signal.aborted) {
          onVerdict?.(verdict, lastUserAnswer(history))
        }
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError(err instanceof TutorError ? err.message : 'The tutor hit an error.')
        setTurns((t) => (t.at(-1)?.content === '' ? t.slice(0, -1) : t))
      } finally {
        if (!ctrl.signal.aborted) setStreaming(false)
      }
    })()
  }

  function send() {
    const text = input.trim()
    if (!text || streaming) return
    const history: TutorTurn[] = [...turns, { role: 'user', content: text }]
    setTurns(history)
    setInput('')
    track('chat_message')
    runTutor(history)
  }

  /** Stop a streaming reply; drop a trailing empty placeholder if nothing came. */
  function stop() {
    abortRef.current?.abort()
    setStreaming(false)
    setTurns((t) => (t.at(-1)?.role === 'assistant' && !t.at(-1)?.content ? t.slice(0, -1) : t))
  }

  /** Retry the last exchange after a mid-stream error. */
  function retry() {
    runTutor(lastHistoryRef.current)
  }

  if (!isTutorConfigured()) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700">
        AI tutor is off for this build. Set{' '}
        <code className="font-mono text-xs">VITE_TUTOR_WORKER_URL</code> to enable it.
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="border-b border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-500 dark:border-neutral-800">
        Tutor
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && !error && (
          <p className="text-sm text-neutral-400">Starting the tutor…</p>
        )}
        {turns.map((turn, i) => (
          <div
            key={i}
            className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
              }
            >
              {turn.content || <TypingDots />}
            </div>
          </div>
        ))}
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={retry}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-center gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer or a question…"
          disabled={streaming}
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
        />
        {streaming ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Send
          </button>
        )}
      </form>
    </div>
  )
}

/** Animated three-dot typing indicator shown before the first token arrives. */
function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Tutor is typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
    </span>
  )
}

/** The learner's most recent typed answer in this history, if any. */
function lastUserAnswer(history: TutorTurn[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content
  }
  return undefined
}
