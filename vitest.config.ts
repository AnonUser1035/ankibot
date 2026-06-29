import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom gives the importer a real DOMParser for HTML stripping, matching
    // the browser. sql.js is loaded with an explicit wasmBinary in tests.
    environment: 'jsdom',
    globals: true,
  },
})
