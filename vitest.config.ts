import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * Vitest runs outside Nuxt, so it knows nothing about Nuxt's `~` and `~~`.
 * Without these, anything under `app/` is untestable the moment it imports
 * shared code — which is most of it.
 *
 * Ordered and anchored rather than plain prefixes: `~` alone also matches
 * `~~/shared`, and would rewrite it to `app~/shared`.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^~~\//, replacement: root },
      { find: /^~\//, replacement: `${root}app/` },
    ],
  },
})
