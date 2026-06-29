import { useEffect, useState } from 'react'
import { ApiKeySettings } from './components/ApiKeySettings'
import { DeckView } from './components/DeckView'
import { ImportSaveButton } from './components/ImportSaveButton'
import { Importer } from './components/Importer'
import { Study } from './components/Study'
import { type CoachingInput, applyCoaching } from './lib/coaching'
import { exportDeckToFile, importDeckFromFile } from './lib/export'
import { type ImportResult, importApkgFile } from './lib/importApkg'
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
import { loadUserApiKey } from './lib/userKey'
import type { Deck } from './types/deck'

const config = DEFAULT_SRS_CONFIG

type Skipped = { cloze: number; media: number }

function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [skipped, setSkipped] = useState<Skipped | null>(null)
  const [swap, setSwap] = useState(false)
  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Boot: restore the active deck and load the BYO key (both off IndexedDB)
  // before showing the UI so nothing flashes before restored state is in place.
  useEffect(() => {
    let cancelled = false
    Promise.all([loadActiveDeck(), loadUserApiKey()])
      .then(([restored]) => {
        if (cancelled) return
        if (restored) setDeck(restored)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setNotice(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function autosave(next: Deck) {
    persistDeck(next).catch((err: unknown) => setNotice(errorMessage(err)))
  }

  function onImported(result: ImportResult) {
    setDeck(result.deck)
    setSkipped(result.skipped)
    setSession(null)
    setSwap(false)
    setNotice(null)
    autosave(result.deck)
  }

  async function onTrySample() {
    setSampleLoading(true)
    setNotice(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample.apkg`)
      if (!res.ok) throw new Error('sample fetch failed')
      const blob = await res.blob()
      const file = new File([blob], 'Sample Deck.apkg', {
        type: 'application/octet-stream',
      })
      onImported(await importApkgFile(file))
    } catch {
      setNotice('Could not load the sample deck. Try importing your own .apkg file.')
    } finally {
      setSampleLoading(false)
    }
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
      setSkipped(null)
      setSession(null)
      setSwap(false)
      setNotice(null)
      autosave(restored)
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
      setSkipped(null)
      setNotice(null)
    } catch (err) {
      setNotice(errorMessage(err))
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4 sm:px-6">
          <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            ankibot
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
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
              Study smarter with an AI tutor
            </h1>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">
              Import an Anki <code className="font-mono text-sm">.apkg</code> deck (basic
              text cards). A tutor talks you through each card, remembers what trips you up,
              and a Leitner scheduler handles spaced repetition — all in your browser.
            </p>

            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                New here? Try it in one click.
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Load a small sample deck and start studying immediately — no file needed.
              </p>
              <button
                type="button"
                onClick={onTrySample}
                disabled={sampleLoading}
                className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {sampleLoading ? 'Loading…' : 'Try the sample deck'}
              </button>
            </div>

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
            {skipped && (skipped.cloze > 0 || skipped.media > 0) && (
              <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Imported {deck.cards.length} card{deck.cards.length === 1 ? '' : 's'}.{' '}
                Skipped {skipSummary(skipped)} — not supported in v1.
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
            <ApiKeySettings />
          </>
        )}
      </main>
    </div>
  )
}

function skipSummary(s: Skipped): string {
  const parts: string[] = []
  if (s.cloze > 0) parts.push(`${s.cloze} cloze`)
  if (s.media > 0) parts.push(`${s.media} media`)
  return `${parts.join(' and ')} card${s.cloze + s.media === 1 ? '' : 's'}`
}

/** Pull a user-facing message off our typed errors; generic fallback otherwise. */
function errorMessage(err: unknown): string {
  if (err instanceof SaveFileError || err instanceof StorageError) {
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

export default App
