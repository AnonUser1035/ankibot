import type { SessionState } from '../lib/session'

/**
 * End-of-session screen, shared by both study surfaces (flashcards and the
 * examiner chat). Reaching the end of the queue swaps the active surface for
 * this summary.
 */
export function SessionSummary({
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
        Reviewed {reviewed} ·{' '}
        <span className="text-green-700 dark:text-green-400">{correct} got</span> ·{' '}
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
