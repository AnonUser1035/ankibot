import { useCallback, useRef, useState } from 'react'
import {
  ImportError,
  type ImportResult,
  importApkgFile,
} from '../lib/importApkg'

type Status = 'idle' | 'parsing' | 'done' | 'error'

export function Importer() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setStatus('parsing')
    setError(null)
    setResult(null)
    try {
      const res = await importApkgFile(file)
      setResult(res)
      setStatus('done')
    } catch (err) {
      // Show actionable messages for known failures; stay calm for the rest.
      const message =
        err instanceof ImportError
          ? err.message
          : 'Something went wrong reading that file. Please try a different .apkg.'
      setError(message)
      setStatus('error')
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  return (
    <div className="w-full">
      {/* Drop zone / file picker */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging
            ? 'border-neutral-500 bg-neutral-100 dark:bg-neutral-900'
            : 'border-neutral-300 dark:border-neutral-700'
        }`}
      >
        <p className="text-neutral-600 dark:text-neutral-400">
          Drag an <code className="font-mono text-sm">.apkg</code> here, or
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".apkg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = '' // allow re-picking the same file
          }}
        />
        <p className="mt-3 text-xs text-neutral-400">
          Parsed entirely in your browser. Nothing is uploaded.
        </p>
      </div>

      {status === 'parsing' && (
        <p className="mt-6 text-center text-neutral-500">Reading deck…</p>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {status === 'done' && result && <DeckView result={result} />}
    </div>
  )
}

function DeckView({ result }: { result: ImportResult }) {
  const { deck, skipped } = result
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {deck.name}
        </h2>
        <span className="text-sm text-neutral-500">
          {deck.cards.length} card{deck.cards.length === 1 ? '' : 's'}
        </span>
      </div>

      {skipped.cloze > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Skipped {skipped.cloze} cloze card{skipped.cloze === 1 ? '' : 's'} —
          cloze isn't supported in v1.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Front</th>
              <th className="px-4 py-2 font-medium">Back</th>
            </tr>
          </thead>
          <tbody>
            {deck.cards.map((card, i) => (
              <tr
                key={card.id}
                className="border-t border-neutral-200 align-top dark:border-neutral-800"
              >
                <td className="px-4 py-2 text-neutral-400 tabular-nums">
                  {i + 1}
                </td>
                <td className="px-4 py-2 text-neutral-900 dark:text-neutral-100">
                  {card.front}
                </td>
                <td className="px-4 py-2 text-neutral-700 dark:text-neutral-300">
                  {card.back}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
