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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          ankibot
        </h1>
        <p className="mt-3 max-w-md text-neutral-500 dark:text-neutral-400">
          A flashcard tutor, coming together one phase at a time. This is the
          scaffold.
        </p>
      </main>
    </div>
  )
}

export default App
