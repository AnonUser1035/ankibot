/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Deployed tutor-proxy Worker URL (see /worker). Set in a local `.env` or the
   * build environment. When unset, the AI tutor is disabled and the rest of the
   * app works unchanged. The Anthropic key is NEVER here — it lives only as a
   * Worker secret.
   */
  readonly VITE_TUTOR_WORKER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
