import { useRef } from 'react'

/**
 * Picks a previously exported `*.ankitutor.json` save file and hands the File
 * to the caller. This is the RESTORE-progress entry point — deliberately kept
 * separate from the `.apkg` seed flow (Importer), which starts review state
 * fresh. Same control, used on the landing screen and the deck view.
 */
export function ImportSaveButton({
  onFile,
  className,
  children,
}: {
  onFile: (file: File) => void
  className?: string
  children: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.ankitutor.json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
