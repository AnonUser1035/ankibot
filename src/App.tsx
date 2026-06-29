import { useState } from 'react'
import { DeckView } from './components/DeckView'
import { Importer } from './components/Importer'
import { Study } from './components/Study'
import type { ImportResult } from './lib/importApkg'
import {
  type SessionState,
  answerCurrent,
  currentCardId,
  startSession,
} from './lib/session'
import { DEFAULT_SRS_CONFIG, type Grade, buildSession } from './lib/srs'
import type { Deck } from './types/deck'

const config = DEFAULT_SRS_CONFIG

function App() {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [skippedCloze, setSkippedCloze] = useState(0)
  const [swap, setSwap] = useState(false)
  const [session, setSession] = useState<SessionState | null>(null)

  function onImported(result: ImportResult) {
    setDeck(result.deck)
    setSkippedCloze(result.skipped.cloze)
    setSession(null)
    setSwap(false)
  }

  function beginSession(studyAhead: boolean) {
    if (!deck) return
    const queue = buildSession(deck, Date.now(), config, { studyAhead })
    setSession(startSession(queue))
  }

  function onAnswer(grade: Grade) {
    if (!deck || !session) return
    const id = currentCardId(session)
    if (!id) return
    const card = deck.cards.find((c) => c.id === id)
    if (!card) return
    const { state, updatedCard } = answerCurrent(
      session,
      card,
      grade,
      Date.now(),
      config,
    )
    setDeck({
      ...deck,
      cards: deck.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
    })
    setSession(state)
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
        {!deck ? (
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
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App
