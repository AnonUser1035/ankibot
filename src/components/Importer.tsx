import { useCallback, useRef, useState } from 'react'
import {
  ImportError,
  type ImportResult,
  importApkgFile,
} from '../lib/importApkg'

type Status = 'idle' | 'parsing' | 'error'

export function Importer({
  onImported,
}: {
  onImported: (result: ImportResult) => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setStatus('parsing')
      setError(null)
      try {
        const res = await importApkgFile(file)
        onImported(res)
        setStatus('idle')
      } catch (err) {
        const message =
          err instanceof ImportError
            ? err.message
            : 'Something went wrong reading that file. Please try a different .apkg.'
        setError(message)
        setStatus('error')
      }
    },
    [onImported],
  )

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
            e.target.value = ''
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
    </div>
  )
}
