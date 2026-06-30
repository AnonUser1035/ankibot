import { useEffect, useRef, useState } from 'react'
import { track, trackPageView } from '../lib/analytics'
import type { CoachingInput } from '../lib/coaching'
import {
  type SessionState,
  currentCardId,
  isComplete,
  remaining,
} from '../lib/session'
import type { Grade } from '../lib/srs'
import {
  type ParsedVerdict,
  type TutorTurn,
  TutorError,
  isTutorConfigured,
  respond,
} from '../lib/tutor'
import type { Card, Deck } from '../types/deck'
import { FormattedMessage } from './FormattedMessage'
import { SessionSummary } from './SessionSummary'

/**
 * Chat mode — the examiner. One continuous conversation that walks the SAME
 * session queue as flashcards mode. The CLIENT decides which card is on the
 * table (from the queue); the model only quizzes and judges. When the examiner
 * concludes a card it emits a verdict (parsed in tutor.ts), which we auto-apply
 * to the SRS via `onAnswer` — exactly the path a manual Got it / Missed it press
 * takes. The grade is shown inline and is reversible (one-deep undo), and a
 * malformed/absent verdict never touches scheduling: the learner can force the
 * grade with the manual fallback, otherwise nothing moves.
 */
export function ChatStudy({
  deck,
  session,
  onAnswer,
  onUndo,
  canUndo,
  onRestart,
  onExit,
}: {
  deck: Deck
  session: SessionState
  /** Apply a grade to the current card (snapshots for undo in the parent). */
  onAnswer: (grade: Grade, coaching?: CoachingInput) => void
  /** Revert the most recent chat grade. Returns true if something was undone. */
  onUndo: () => boolean
  /** Whether a grade is available to undo (parent holds the snapshot). */
  canUndo: boolean
  onRestart: () => void
  onExit: () => void
}) {
  const [turns, setTurns] = useState<TutorTurn[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastGrade, setLastGrade] = useState<{ grade: Grade; front: string } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Exact mirror of `turns` so synchronous logic (slicing the current card's
  // sub-conversation, setting a fresh base) sees the latest value, not a stale
  // closure.
  const turnsRef = useRef<TutorTurn[]>([])
  // Index in `turns` where the CURRENT card's sub-conversation begins. Each card
  // gets a fresh exchange; we only send the model turns from here on, keeping
  // context tight and "move to the next card" a clean reset.
  const baseRef = useRef(0)
  // The card id we've already opened a quiz on, so advancing (or undoing) the
  // queue triggers exactly one fresh opener.
  const lastAskedRef = useRef<string | null>(null)
  // Where to truncate `turns` on undo (the base of the just-graded card).
  const undoBaseRef = useRef<number | null>(null)
  // The history we last sent, so a mid-stream error can be retried.
  const lastHistoryRef = useRef<TutorTurn[]>([])

  const complete = isComplete(session)
  const currentId = currentCardId(session)
  const card = currentId
    ? (deck.cards.find((c) => c.id === currentId) ?? null)
    : null

  /** setState for turns that also keeps the synchronous mirror exact. */
  function updateTurns(fn: (prev: TutorTurn[]) => TutorTurn[]) {
    setTurns((prev) => {
      const next = fn(prev)
      turnsRef.current = next
      return next
    })
  }

  // Open a fresh quiz whenever the current target changes — on mount (first
  // card), after a grade advances the queue, and after an undo restores a card.
  // Depends on `session`: the parent hands down a new SessionState on every move.
  useEffect(() => {
    if (!isTutorConfigured()) return
    if (complete) {
      trackPageView('summary')
      return
    }
    const id = currentCardId(session)
    if (!id || id === lastAskedRef.current) return
    lastAskedRef.current = id
    baseRef.current = turnsRef.current.length
    runExaminer([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, complete])

  // Abort any in-flight stream when we unmount (e.g. exit to deck).
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  // Keep focus in the answer box once it's usable again. Submitting disables the
  // input while the examiner streams, which blurs it; refocus when streaming ends
  // (and on each new card) so the learner can keep typing without reclicking.
  useEffect(() => {
    if (!streaming && !complete && isTutorConfigured()) {
      inputRef.current?.focus()
    }
  }, [streaming, complete, currentId])

  /** Stream one examiner turn for `history` (the current card's sub-conversation). */
  function runExaminer(history: TutorTurn[]) {
    const target = card
    if (!target) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    lastHistoryRef.current = history

    setStreaming(true)
    setError(null)
    updateTurns((t) => [...t, { role: 'assistant', content: '' }])

    void (async () => {
      let verdict: ParsedVerdict | null = null
      let any = false
      try {
        const it = respond({
          card: target,
          coaching: target.coaching,
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
          updateTurns((t) => {
            const copy = t.slice()
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { role: 'assistant', content: last.content + value }
            return copy
          })
        }
        if (!any) updateTurns((t) => t.slice(0, -1))
        // A verdict means the examiner concluded this card → grade it and the
        // queue advances (the effect above then opens the next card).
        if (verdict && !ctrl.signal.aborted) {
          applyGrade(verdict.suggestedRating === 'got_it' ? 'correct' : 'incorrect', target, {
            lastAnswer: lastUserAnswer(history),
            memoryNote: verdict.memoryNote,
          })
        }
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError(err instanceof TutorError ? err.message : 'The examiner hit an error.')
        updateTurns((t) => (t.at(-1)?.content === '' ? t.slice(0, -1) : t))
      } finally {
        if (!ctrl.signal.aborted) setStreaming(false)
      }
    })()
  }

  /** Record a grade for `target` and snapshot it for undo. The parent advances. */
  function applyGrade(grade: Grade, target: Card, coaching: CoachingInput) {
    undoBaseRef.current = baseRef.current
    setLastGrade({ grade, front: target.front })
    onAnswer(grade, coaching)
  }

  function send() {
    const text = input.trim()
    if (!text || streaming || !card) return
    const history: TutorTurn[] = [
      ...turnsRef.current.slice(baseRef.current),
      { role: 'user', content: text },
    ]
    updateTurns((t) => [...t, { role: 'user', content: text }])
    setInput('')
    track('chat_message')
    runExaminer(history)
  }

  /** Fail-safe / learner override: conclude the current card without a verdict. */
  function manualGrade(grade: Grade) {
    if (!card) return
    abortRef.current?.abort()
    setStreaming(false)
    setInput('')
    setError(null)
    track('chat_card_assessed', { grade, source: 'manual' })
    applyGrade(grade, card, {
      lastAnswer: lastUserAnswer(turnsRef.current.slice(baseRef.current)),
      memoryNote: null,
    })
  }

  function undo() {
    if (!onUndo()) return
    const base = undoBaseRef.current ?? turnsRef.current.length
    abortRef.current?.abort()
    updateTurns((t) => t.slice(0, base))
    baseRef.current = base
    lastAskedRef.current = null // force the effect to re-open the restored card
    undoBaseRef.current = null
    setLastGrade(null)
    setError(null)
    setStreaming(false)
    track('chat_verdict_overridden')
  }

  function stop() {
    abortRef.current?.abort()
    setStreaming(false)
    updateTurns((t) =>
      t.at(-1)?.role === 'assistant' && !t.at(-1)?.content ? t.slice(0, -1) : t,
    )
  }

  function retry() {
    runExaminer(lastHistoryRef.current)
  }

  if (complete) {
    return <SessionSummary session={session} onRestart={onRestart} onExit={onExit} />
  }

  if (!isTutorConfigured()) {
    return (
      <div>
        <BackToDeck onExit={onExit} />
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-700">
          Chat mode needs the AI examiner, which is off for this build. Set{' '}
          <code className="font-mono text-xs">VITE_TUTOR_WORKER_URL</code> (or add your own
          API key in tutor settings) to enable it, or use Flashcards mode.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <BackToDeck onExit={onExit} />
        <span className="tabular-nums">
          {remaining(session)} left · {session.stats.correct} got ·{' '}
          {session.stats.missed} missed
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
          {/* Deliberately does NOT show the card — the examiner controls what's
              revealed, so naming the word here would spoil a production quiz. */}
          <span className="min-w-0 truncate text-xs text-neutral-500">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              Examiner
            </span>{' '}
            · card {session.stats.reviewed + 1}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => manualGrade('incorrect')}
              title="Mark this card missed and move on"
              className="rounded-md border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              ✗ Missed
            </button>
            <button
              type="button"
              onClick={() => manualGrade('correct')}
              title="Mark this card got and move on"
              className="rounded-md border border-green-300 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-300 dark:hover:bg-green-950"
            >
              ✓ Got it
            </button>
          </div>
        </div>

        <div className="max-h-96 space-y-3 overflow-y-auto px-4 py-3">
          {turns.length === 0 && !error && (
            <p className="text-sm text-neutral-400">Starting the examiner…</p>
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
                    : 'max-w-[85%] rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
                }
              >
                {turn.role === 'user' ? (
                  turn.content
                ) : turn.content ? (
                  <FormattedMessage content={turn.content} />
                ) : (
                  <TypingDots />
                )}
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

        {lastGrade && canUndo && !streaming && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900/60">
            <span className="text-neutral-600 dark:text-neutral-400">
              Recorded{' '}
              {lastGrade.grade === 'correct' ? (
                <span className="font-medium text-green-700 dark:text-green-400">
                  ✓ Got it
                </span>
              ) : (
                <span className="font-medium text-red-700 dark:text-red-400">
                  ✗ Missed it
                </span>
              )}{' '}
              for <span className="text-neutral-800 dark:text-neutral-200">{lastGrade.front}</span>
            </span>
            <button
              type="button"
              onClick={undo}
              className="shrink-0 font-medium text-neutral-700 underline underline-offset-2 dark:text-neutral-300"
            >
              Undo &amp; retry this card
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-center gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
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
    </div>
  )
}

function BackToDeck({ onExit }: { onExit: () => void }) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
    >
      ← Back to deck
    </button>
  )
}

/** Animated three-dot typing indicator shown before the first token arrives. */
function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Examiner is typing">
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
