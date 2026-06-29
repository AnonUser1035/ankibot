import { useEffect, useRef, useState } from 'react'
import {
  type TutorTurn,
  TutorError,
  isTutorConfigured,
  respond,
} from '../lib/tutor'
import type { Card } from '../types/deck'

/**
 * Streaming AI chat alongside the current card.
 *
 * Scoped PER CARD (decision 4): the parent mounts this with `key={card.id}`, so
 * advancing the card remounts it fresh — a new tutoring exchange, tight context.
 * On mount the tutor opens proactively (decision 3); the user types; replies
 * stream in token-by-token.
 *
 * This component never touches SRS/review state — purely conversational.
 */
export function TutorChat({ card }: { card: Card }) {
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // Track the active request so unmount (card change) aborts the stream.
  const abortRef = useRef<AbortController | null>(null)

  // Proactive opener on mount. Empty deps: this runs once per card because the
  // parent keys us by card.id (remount === new card).
  useEffect(() => {
    if (!isTutorConfigured()) return
    runTutor([])
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the latest message in view as it streams.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  /**
   * Stream a tutor reply given the conversation `history` to send. Appends an
   * empty assistant turn and fills it as chunks arrive.
   */
  function runTutor(history: TutorTurn[]) {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setStreaming(true)
    setError(null)
    setTurns((t) => [...t, { role: 'assistant', content: '' }])

    void (async () => {
      try {
        let any = false
        for await (const chunk of respond({
          card,
          recentTurns: history,
          signal: ctrl.signal,
        })) {
          any = true
          setTurns((t) => {
            const copy = t.slice()
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { role: 'assistant', content: last.content + chunk }
            return copy
          })
        }
        // If the stream produced nothing (e.g. empty reply), drop the placeholder.
        if (!any) setTurns((t) => t.slice(0, -1))
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError(err instanceof TutorError ? err.message : 'The tutor hit an error.')
        // Remove the empty assistant placeholder on failure.
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
    runTutor(history)
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
              {turn.content || (
                <span className="inline-block animate-pulse text-neutral-400">…</span>
              )}
            </div>
          </div>
        ))}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </p>
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
          className="flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Send
        </button>
      </form>
    </div>
  )
}
