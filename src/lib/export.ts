/**
 * File export/import — the durable backup layer. "The file IS the sync":
 * there is no cloud; this download is what lets progress outlive any one
 * browser and move between machines, by hand and by design.
 *
 * Both directions go through the canonical serializer (saveFile.ts), the same
 * one IndexedDB uses, so a file and a DB record are byte-identical in shape.
 */
import {
  type SaveFile,
  SaveFileError,
  deserialize,
  saveFileName,
  serialize,
} from './saveFile'
import type { Deck } from '../types/deck'

/**
 * Serialize a deck and trigger a browser download. No File System Access API —
 * the classic Blob + object-URL + temporary anchor works in every browser
 * (decision 3: same-file write-back is a later nicety).
 */
export function exportDeckToFile(deck: Deck, now: number = Date.now()): void {
  const save: SaveFile = serialize(deck, now)
  const json = JSON.stringify(save, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = saveFileName(deck, now)
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Revoke after the click has been dispatched so the download isn't cut off.
    URL.revokeObjectURL(url)
  }
}

/**
 * Read a previously exported save file and restore its deck. Parses JSON, then
 * runs the shared validator. Both JSON and structural errors surface as a
 * SaveFileError with an actionable message — never a raw crash.
 */
export async function importDeckFromFile(file: File): Promise<Deck> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Re-use the typed error so callers handle one error type.
    throw new SaveFileError(
      "This file isn't valid JSON, so it can't be an ankibot save.",
    )
  }
  return deserialize(parsed).deck
}
