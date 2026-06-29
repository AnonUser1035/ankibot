import { useCallback, useEffect, useState } from 'react'
import type { Grade } from '../lib/srs'
import {
  type SessionState,
  currentCardId,
  isComplete,
  remaining,
} from '../lib/session'
import type { Deck } from '../types/deck'

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
    return <Summary session={session} onRestart={onRestart} onExit={onExit} />
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

      <div className="mt-6 flex justify-center gap-3">
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

function Summary({
  session,
  onRestart,
  onExit,
}: {
  session: SessionState
  onRestart: () => void
  onExit: () => void
}) {
  const { reviewed, correct, missed } = session.stats
  return (
    <div className="rounded-xl border border-neutral-200 px-6 py-10 text-center dark:border-neutral-800">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Session complete
      </h2>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        Reviewed {reviewed} · <span className="text-green-700 dark:text-green-400">{correct} got</span> ·{' '}
        <span className="text-red-700 dark:text-red-400">{missed} missed</span>
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Study again
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Back to deck
        </button>
      </div>
    </div>
  )
}
