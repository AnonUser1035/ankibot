/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Deployed tutor-proxy Worker URL (see /worker). Set in a local `.env` or the
   * build environment. When unset, the AI tutor is disabled and the rest of the
   * app works unchanged. The Anthropic key is NEVER here — it lives only as a
   * Worker secret.
   */
  readonly VITE_TUTOR_WORKER_URL?: string

  /**
   * GA4 measurement ID (e.g. G-XXXXXXXXXX) for the ankibot analytics property.
   * When unset, analytics is disabled — so dev/preview builds report nothing.
   * Safe to expose publicly; it's a client-side measurement ID, not a secret.
   */
  readonly VITE_GA_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
