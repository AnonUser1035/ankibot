import { Importer } from './components/Importer'

function App() {
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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Import a deck
        </h1>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Pick an Anki <code className="font-mono text-sm">.apkg</code> file to
          see its cards. Basic (text) cards only for now.
        </p>
        <div className="mt-8">
          <Importer />
        </div>
      </main>
    </div>
  )
}

export default App
