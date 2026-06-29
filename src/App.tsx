import { useEffect, useState } from 'react'
import { track, trackPageView } from './lib/analytics'
import { ApiKeySettings } from './components/ApiKeySettings'
import { ChatStudy } from './components/ChatStudy'
import { DeckView } from './components/DeckView'
import { ImportSaveButton } from './components/ImportSaveButton'
import { Importer } from './components/Importer'
import { Study } from './components/Study'
import { type CoachingInput, applyCoaching } from './lib/coaching'
import { exportDeckToFile, importDeckFromFile } from './lib/export'
import { type ImportResult, importApkgFile } from './lib/importApkg'
import { mergeProgress } from './lib/mergeProgress'
import { SaveFileError } from './lib/saveFile'
import {
  type SessionState,
  answerCurrent,
  currentCardId,
  startSession,
} from './lib/session'
import {
  DEFAULT_SRS_CONFIG,
  type Grade,
  buildSession,
  recordNewIntroductions,
} from './lib/srs'
import {
  StorageError,
  clearAllSavedData,
  getDeck,
  loadActiveDeck,
  persistDeck,
} from './lib/storage'
import { loadUserApiKey } from './lib/userKey'
import type { Deck } from './types/deck'

const config = DEFAULT_SRS_CONFIG

type Skipped = { cloze: number; media: number }
/** Which study surface a session runs in (separate, switchable). */
type StudyMode = 'flashcards' | 'chat'

function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [skipped, setSkipped] = useState<Skipped | null>(null)
  const [swap, setSwap] = useState(false)
  const [mode, setMode] = useState<StudyMode>('flashcards')
  const [session, setSession] = useState<SessionState | null>(null)
  // One-deep snapshot of {deck, session} taken right before a chat-mode grade,
  // so the examiner's auto-applied verdict is reversible (Undo). Cleared on
  // undo, exit, and at the start of each session.
  const [chatSnapshot, setChatSnapshot] = useState<{
    deck: Deck
    session: SessionState
  } | null>(null)
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

  // Report a virtual pageview whenever the active view changes. Study's
  // completion (summary) screen reports itself from inside <Study>.
  useEffect(() => {
    if (loading) return
    trackPageView(!deck ? 'landing' : session ? (mode === 'chat' ? 'chat' : 'study') : 'deck')
  }, [loading, deck, session, mode])

  function autosave(next: Deck) {
    persistDeck(next).catch((err: unknown) => setNotice(errorMessage(err)))
  }

  async function onImported(result: ImportResult, source: 'file' | 'sample' = 'file') {
    // Re-importing the same deck (stable content id) must not wipe progress:
    // carry existing review state + coaching forward, matched by card id. A
    // first import (or a storage miss) just uses the fresh deck.
    let deck = result.deck
    try {
      const existing = await getDeck(deck.id)
      if (existing) deck = mergeProgress(existing, result.deck)
    } catch {
      // Non-fatal: fall back to the fresh import.
    }
    setDeck(deck)
    setSkipped(result.skipped)
    setSession(null)
    setSwap(false)
    setNotice(null)
    autosave(deck)
    track('deck_imported', { source, cards: deck.cards.length })
  }

  async function onTrySample() {
    setSampleLoading(true)
    setNotice(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample.apkg`)
      if (!res.ok) throw new Error('sample fetch failed')
      const blob = await res.blob()
      const file = new File([blob], 'A Frequency Dictionary of Spanish.apkg', {
        type: 'application/octet-stream',
      })
      onImported(await importApkgFile(file), 'sample')
    } catch {
      setNotice('Could not load the sample deck. Try importing your own .apkg file.')
    } finally {
      setSampleLoading(false)
    }
  }

  function beginSession(studyAhead: boolean) {
    if (!deck) return
    const queue = buildSession(deck, Date.now(), config, { studyAhead })
    setChatSnapshot(null)
    setSession(startSession(queue))
    track('study_session_start', { studyAhead, mode, cards: queue.length })
  }

  function exitSession() {
    setSession(null)
    setChatSnapshot(null)
  }

  /**
   * Apply a chat-mode (examiner) grade. Same scheduling path as a manual press,
   * but first snapshots {deck, session} so the auto-applied verdict can be
   * undone (one level deep).
   */
  function onChatAnswer(grade: Grade, coaching?: CoachingInput) {
    if (!deck || !session) return
    setChatSnapshot({ deck, session })
    onAnswer(grade, coaching)
  }

  /** Revert the most recent chat grade. Returns true if something was undone. */
  function onUndoChat(): boolean {
    if (!chatSnapshot) return false
    setDeck(chatSnapshot.deck)
    setSession(chatSnapshot.session)
    autosave(chatSnapshot.deck)
    setChatSnapshot(null)
    return true
  }

  function onAnswer(grade: Grade, coaching?: CoachingInput) {
    if (!deck || !session) return
    const id = currentCardId(session)
    if (!id) return
    const card = deck.cards.find((c) => c.id === id)
    if (!card) return
    const now = Date.now()
    // A brand-new card (never reviewed) counts against today's new-card budget
    // the first time it's studied — captured before applyAnswer bumps reps.
    const wasNew = card.reviewState.reps === 0
    const { state, updatedCard } = answerCurrent(session, card, grade, now, config)
    // The press grades the SRS (updatedCard.reviewState). Coaching memory rides
    // alongside — deterministic baseline always, AI note when present. The AI
    // never mutates review state; only this human press does.
    const coached = applyCoaching(updatedCard, grade, coaching, now)
    const finalCard =
      coached === updatedCard.coaching ? updatedCard : { ...updatedCard, coaching: coached }
    const withCard: Deck = {
      ...deck,
      cards: deck.cards.map((c) => (c.id === finalCard.id ? finalCard : c)),
    }
    // Advance the daily ledger so finishing a batch doesn't re-offer 20 more.
    const nextDeck = wasNew ? recordNewIntroductions(withCard, 1, now) : withCard
    setDeck(nextDeck)
    setSession(state)
    autosave(nextDeck) // persist progress + coaching on every answer
    track('card_reviewed', { grade })
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
              Flip through flashcards, or switch to Chat and let an AI examiner quiz you and
              judge what you actually know — it remembers what trips you up, and a Leitner
              scheduler handles spaced repetition. All in your browser. Bring your own Anki{' '}
              <code className="font-mono text-sm">.apkg</code> deck, or start with the one
              below.
            </p>

            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                New here? Start in one click.
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Load the 1000 most common Spanish words and start studying immediately — no
                file needed.
              </p>
              <button
                type="button"
                onClick={onTrySample}
                disabled={sampleLoading}
                className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {sampleLoading ? 'Loading…' : 'Start with Spanish 1000'}
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
          mode === 'chat' ? (
            <ChatStudy
              deck={deck}
              session={session}
              onAnswer={onChatAnswer}
              onUndo={onUndoChat}
              canUndo={chatSnapshot !== null}
              onRestart={() => beginSession(false)}
              onExit={exitSession}
            />
          ) : (
            <Study
              deck={deck}
              session={session}
              swap={swap}
              onAnswer={onAnswer}
              onRestart={() => beginSession(false)}
              onExit={exitSession}
            />
          )
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
              mode={mode}
              onSetMode={setMode}
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
