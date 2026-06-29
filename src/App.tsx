import { useEffect, useState } from 'react'
import { DeckView } from './components/DeckView'
import { ImportSaveButton } from './components/ImportSaveButton'
import { Importer } from './components/Importer'
import { Study } from './components/Study'
import { type CoachingInput, applyCoaching } from './lib/coaching'
import { exportDeckToFile, importDeckFromFile } from './lib/export'
import type { ImportResult } from './lib/importApkg'
import { SaveFileError } from './lib/saveFile'
import {
  type SessionState,
  answerCurrent,
  currentCardId,
  startSession,
} from './lib/session'
import { DEFAULT_SRS_CONFIG, type Grade, buildSession } from './lib/srs'
import {
  StorageError,
  clearAllSavedData,
  loadActiveDeck,
  persistDeck,
} from './lib/storage'
import type { Deck } from './types/deck'

const config = DEFAULT_SRS_CONFIG

function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [skippedCloze, setSkippedCloze] = useState(0)
  const [swap, setSwap] = useState(false)
  const [session, setSession] = useState<SessionState | null>(null)
  // Boot starts in a loading state while we read IndexedDB, so the study UI
  // never flashes before restored progress is in place.
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  // Restore the active deck from IndexedDB on boot (decision 5: autosave layer).
  useEffect(() => {
    let cancelled = false
    loadActiveDeck()
      .then((restored) => {
        if (cancelled) return
        if (restored) setDeck(restored)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Empty storage returns null (handled above); reaching here means a
        // real read failure or a corrupt record. Surface it; fall through to
        // the import prompt rather than blocking the app.
        setNotice(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Persist a deck, surfacing (not throwing) storage errors. */
  function autosave(next: Deck) {
    persistDeck(next).catch((err: unknown) => setNotice(errorMessage(err)))
  }

  function onImported(result: ImportResult) {
    setDeck(result.deck)
    setSkippedCloze(result.skipped.cloze)
    setSession(null)
    setSwap(false)
    setNotice(null)
    autosave(result.deck)
  }

  function beginSession(studyAhead: boolean) {
    if (!deck) return
    const queue = buildSession(deck, Date.now(), config, { studyAhead })
    setSession(startSession(queue))
  }

  function onAnswer(grade: Grade, coaching?: CoachingInput) {
    if (!deck || !session) return
    const id = currentCardId(session)
    if (!id) return
    const card = deck.cards.find((c) => c.id === id)
    if (!card) return
    const now = Date.now()
    const { state, updatedCard } = answerCurrent(session, card, grade, now, config)
    // The press grades the SRS (updatedCard.reviewState). Coaching memory rides
    // alongside — deterministic baseline always, AI note when present. The AI
    // never mutates review state; only this human press does.
    const coached = applyCoaching(updatedCard, grade, coaching, now)
    const finalCard =
      coached === updatedCard.coaching ? updatedCard : { ...updatedCard, coaching: coached }
    const nextDeck: Deck = {
      ...deck,
      cards: deck.cards.map((c) => (c.id === finalCard.id ? finalCard : c)),
    }
    setDeck(nextDeck)
    setSession(state)
    autosave(nextDeck) // persist progress + coaching on every answer
  }

  function onExport() {
    if (!deck) return
    try {
      exportDeckToFile(deck)
    } catch (err) {
      setNotice(errorMessage(err))
    }
  }

  async function onImportSave(file: File) {
    try {
      const restored = await importDeckFromFile(file)
      setDeck(restored)
      setSkippedCloze(0)
      setSession(null)
      setSwap(false)
      setNotice(null)
      autosave(restored) // restored progress becomes the new active deck
    } catch (err) {
      setNotice(errorMessage(err))
    }
  }

  async function onClearSavedData() {
    if (
      !window.confirm(
        'Clear all saved progress from this browser? Your exported save files are not affected.',
      )
    ) {
      return
    }
    try {
      await clearAllSavedData()
      setDeck(null)
      setSession(null)
      setSkippedCloze(0)
      setNotice(null)
    } catch (err) {
      setNotice(errorMessage(err))
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            ankibot
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {notice && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-center text-neutral-500">Restoring your progress…</p>
        ) : !deck ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Import a deck
            </h1>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">
              Pick an Anki <code className="font-mono text-sm">.apkg</code> file to
              study its cards. Basic (text) cards only for now.
            </p>
            <div className="mt-8">
              <Importer onImported={onImported} />
            </div>
            <p className="mt-6 text-center text-sm text-neutral-500">
              Already have a saved backup?{' '}
              <ImportSaveButton
                onFile={onImportSave}
                className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100"
              >
                Import a save file
              </ImportSaveButton>
            </p>
          </>
        ) : session ? (
          <Study
            deck={deck}
            session={session}
            swap={swap}
            onAnswer={onAnswer}
            onRestart={() => beginSession(false)}
            onExit={() => setSession(null)}
          />
        ) : (
          <>
            {skippedCloze > 0 && (
              <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Skipped {skippedCloze} cloze card{skippedCloze === 1 ? '' : 's'} —
                cloze isn't supported in v1.
              </p>
            )}
            <DeckView
              deck={deck}
              swap={swap}
              onToggleSwap={() => setSwap((s) => !s)}
              onStudy={() => beginSession(false)}
              onStudyAhead={() => beginSession(true)}
              onReset={() => {
                setDeck(null)
                setSession(null)
              }}
              onExport={onExport}
              onImportSave={onImportSave}
              onClearSavedData={onClearSavedData}
            />
          </>
        )}
      </main>
    </div>
  )
}

/** Pull a user-facing message off our typed errors; generic fallback otherwise. */
function errorMessage(err: unknown): string {
  if (err instanceof SaveFileError || err instanceof StorageError) {
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

export default App
