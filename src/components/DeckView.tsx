import { DEFAULT_SRS_CONFIG, buildSession, isDue } from '../lib/srs'
import type { Deck } from '../types/deck'
import { ImportSaveButton } from './ImportSaveButton'

function formatWhen(ms: number, now: number): string {
  const diff = ms - now
  if (diff <= 0) return 'now'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `in ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours} h`
  const days = Math.round(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

type StudyMode = 'flashcards' | 'chat'

export function DeckView({
  deck,
  swap,
  mode,
  onSetMode,
  onToggleSwap,
  onStudy,
  onStudyAhead,
  onReset,
  onExport,
  onImportSave,
  onClearSavedData,
}: {
  deck: Deck
  swap: boolean
  mode: StudyMode
  onSetMode: (mode: StudyMode) => void
  onToggleSwap: () => void
  onStudy: () => void
  onStudyAhead: () => void
  onReset: () => void
  onExport: () => void
  onImportSave: (file: File) => void
  onClearSavedData: () => void
}) {
  const now = Date.now()
  const dueCount = deck.cards.filter((c) => isDue(c, now)).length
  // How many cards this session will actually serve (after new-card / review caps).
  const sessionSize = buildSession(deck, now, DEFAULT_SRS_CONFIG).length
  const nextDue = deck.cards.reduce(
    (min, c) => (c.reviewState.due < min ? c.reviewState.due : min),
    Number.POSITIVE_INFINITY,
  )

  const promptLabel = swap ? 'Back' : 'Front'
  const answerLabel = swap ? 'Front' : 'Back'

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {deck.name}
        </h2>
        <span className="text-sm text-neutral-500">
          {deck.cards.length} card{deck.cards.length === 1 ? '' : 's'} · {dueCount} due
        </span>
      </div>

      {/* Mode toggle — flashcards and the AI examiner are separate, switchable
          surfaces over the same deck and scheduler. */}
      <div className="mt-5">
        <div
          role="radiogroup"
          aria-label="Study mode"
          className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800"
        >
          {(['flashcards', 'chat'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onSetMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                mode === m
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              {m === 'chat' ? 'Chat' : 'Flashcards'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">
          {mode === 'chat'
            ? 'An AI examiner quizzes you and judges what you know — results update your schedule.'
            : 'Flip cards and grade yourself. Quiet and offline.'}
        </p>
      </div>

      {/* Study controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {dueCount > 0 ? (
          <button
            type="button"
            onClick={onStudy}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {mode === 'chat' ? 'Quiz me on' : 'Study'} {sessionSize} now
          </button>
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            Nothing due right now
            {Number.isFinite(nextDue) && (
              <> — next card due {formatWhen(nextDue, now)}.</>
            )}{' '}
            <button
              type="button"
              onClick={onStudyAhead}
              className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100"
            >
              Study ahead
            </button>
          </div>
        )}

        {mode === 'flashcards' && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={swap}
              onChange={onToggleSwap}
              className="h-4 w-4 accent-neutral-700"
            />
            Swap front / back
          </label>
        )}

        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Import another deck
        </button>
      </div>

      {/* Card table */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">{promptLabel}</th>
              <th className="px-4 py-2 font-medium">{answerLabel}</th>
              <th className="px-4 py-2 font-medium">Box</th>
            </tr>
          </thead>
          <tbody>
            {deck.cards.map((card, i) => (
              <tr
                key={card.id}
                className="border-t border-neutral-200 align-top dark:border-neutral-800"
              >
                <td className="px-4 py-2 text-neutral-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-2 text-neutral-900 dark:text-neutral-100">
                  {swap ? card.back : card.front}
                </td>
                <td className="px-4 py-2 text-neutral-700 dark:text-neutral-300">
                  {swap ? card.front : card.back}
                </td>
                <td className="px-4 py-2 text-neutral-400 tabular-nums">
                  {card.reviewState.box}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Backup & restore — distinct from the .apkg seed flow above. Progress
          autosaves to this browser; the exported file is the durable backup. */}
      <div className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Backup &amp; restore
          </h3>
          <span className="text-xs text-neutral-500">
            Progress autosaves to this browser.
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Export a save file to keep a durable copy you own — the file is the
          backup that outlives this browser.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExport}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            Export save
          </button>
          <ImportSaveButton
            onFile={onImportSave}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            Import save
          </ImportSaveButton>
          <button
            type="button"
            onClick={onClearSavedData}
            className="ml-auto text-sm text-red-700 underline underline-offset-2 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          >
            Clear saved data
          </button>
        </div>
      </div>
    </div>
  )
}
