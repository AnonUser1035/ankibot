import { useState } from 'react'
import { clearUserApiKey, hasUserApiKey, saveUserApiKey } from '../lib/userKey'

/**
 * BYO-key settings (phase 7). Lets a user paste their OWN Anthropic key, stored
 * locally in their browser. When set, the tutor calls Anthropic directly from
 * the browser (bypassing the proxy Worker and its shared monthly cap).
 *
 * Ryan's key is never involved here — this is the user's own key and risk.
 */
export function ApiKeySettings() {
  const [hasKey, setHasKey] = useState(hasUserApiKey())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const key = input.trim()
    if (!key || busy) return
    setBusy(true)
    setError(null)
    try {
      await saveUserApiKey(key)
      setHasKey(true)
      setInput('')
    } catch {
      setError("Couldn't save the key to this browser.")
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    setError(null)
    try {
      await clearUserApiKey()
      setHasKey(false)
    } catch {
      setError("Couldn't clear the key.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Your Anthropic API key (optional)
        </h3>
        <span className="text-xs text-neutral-500">
          {hasKey ? 'Key saved in this browser' : 'Using the shared demo budget'}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Paste your own key to skip the shared monthly limit. It's stored only in{' '}
        <strong>your browser</strong> (IndexedDB) and sent straight to Anthropic — never to
        this site's server.
      </p>

      {hasKey ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
            Active — calls go direct from your browser
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-sm text-red-700 underline underline-offset-2 disabled:opacity-50 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          >
            Remove key
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 disabled:opacity-50 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            Save key
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  )
}
