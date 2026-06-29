/**
 * BYO Anthropic key (phase 7) — the user's OWN key.
 *
 * Kept in a tiny in-memory cache so the tutor seam can decide synchronously
 * whether to call Anthropic directly (BYO) or via the Worker, plus persisted to
 * IndexedDB so it survives reloads. This is the user's key, stored in the user's
 * browser, at the user's risk — Ryan's key never touches the frontend.
 *
 * Isolated in its own module so both the tutor seam (reader) and the settings UI
 * (writer) share one source of truth without the seam importing the UI or vice
 * versa.
 */
import { deleteStoredApiKey, getStoredApiKey, storeApiKey } from './storage'

let cached: string | null = null

/** Load the persisted key into the cache on boot. */
export async function loadUserApiKey(): Promise<void> {
  cached = normalize(await getStoredApiKey())
}

/** The current key, or null. Synchronous (reads the cache). */
export function getUserApiKey(): string | null {
  return cached
}

export function hasUserApiKey(): boolean {
  return cached !== null
}

/** Save a key (cache + persist). Empty/whitespace clears it. */
export async function saveUserApiKey(key: string): Promise<void> {
  const next = normalize(key)
  cached = next
  if (next) await storeApiKey(next)
  else await deleteStoredApiKey()
}

/** Clear the stored key. */
export async function clearUserApiKey(): Promise<void> {
  cached = null
  await deleteStoredApiKey()
}

function normalize(key: string | null): string | null {
  const trimmed = key?.trim()
  return trimmed ? trimmed : null
}
