import { useCallback, useEffect, useState } from 'react'
import { trackPageView } from '../lib/analytics'
import type { Grade } from '../lib/srs'
import {
  type SessionState,
  currentCardId,
  isComplete,
  remaining,
} from '../lib/session'
import type { Deck } from '../types/deck'
import { SessionSummary } from './SessionSummary'

/**
 * Flashcards mode — pure, quiet, manual grading. Prompt → Show answer →
 * Got it / Missed it. No AI here: the conversational, evaluative experience
 * lives in Chat mode (<ChatStudy>). The two are separate, switchable surfaces
 * over the same deck and scheduler.
 */
export function Study({
  deck,
  session,
  swap,
  onAnswer,
  onRestart,
  onExit,
}: {
  deck: Deck
  session: SessionState
  swap: boolean
  /** Grade the current card. Only this human press mutates SRS. */
  onAnswer: (grade: Grade) => void
  onRestart: () => void
  onExit: () => void
}) {
  const [revealed, setRevealed] = useState(false)

  const complete = isComplete(session)
  const currentId = currentCardId(session)
  const card = currentId
    ? (deck.cards.find((c) => c.id === currentId) ?? null)
    : null

  // Reaching the end of the queue swaps the card view for the summary screen.
  useEffect(() => {
    if (complete) trackPageView('summary')
  }, [complete])

  const reveal = useCallback(() => setRevealed(true), [])
  const answer = useCallback(
    (grade: Grade) => {
      setRevealed(false)
      onAnswer(grade)
    },
    [onAnswer],
  )

  // Keyboard niceties: space reveals; 1 = Got it, 2 = Missed it (after reveal).
  useEffect(() => {
    if (complete) return
    function onKey(e: KeyboardEvent) {
      // Don't hijack keys while typing in an input field.
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.key === ' ' && !revealed) {
        e.preventDefault()
        reveal()
      } else if (revealed && (e.key === '1' || e.key === '2')) {
        e.preventDefault()
        answer(e.key === '1' ? 'correct' : 'incorrect')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [complete, revealed, reveal, answer])

  if (complete) {
    return <SessionSummary session={session} onRestart={onRestart} onExit={onExit} />
  }

  if (!card) return null

  const prompt = swap ? card.back : card.front
  const answerText = swap ? card.front : card.back

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <button
          type="button"
          onClick={onExit}
          className="underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          ← Back to deck
        </button>
        <span className="tabular-nums">
          {remaining(session)} left · {session.stats.correct} got ·{' '}
          {session.stats.missed} missed
        </span>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-xl text-neutral-900 dark:text-neutral-100">{prompt}</p>
          {revealed && (
            <>
              <hr className="my-6 w-16 border-neutral-200 dark:border-neutral-800" />
              <p className="text-lg text-neutral-600 dark:text-neutral-300">
                {answerText}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {!revealed ? (
          <button
            type="button"
            onClick={reveal}
            className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Show answer <kbd className="ml-1 opacity-60">space</kbd>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => answer('incorrect')}
              className="rounded-lg border border-red-300 bg-red-50 px-6 py-2.5 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              Missed it <kbd className="ml-1 opacity-60">2</kbd>
            </button>
            <button
              type="button"
              onClick={() => answer('correct')}
              className="rounded-lg border border-green-300 bg-green-50 px-6 py-2.5 text-sm font-medium text-green-800 hover:bg-green-100 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
            >
              Got it <kbd className="ml-1 opacity-60">1</kbd>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
