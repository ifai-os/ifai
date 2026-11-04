import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@payload-config': path.resolve(import.meta.dirname, 'src/payload.config.ts'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // Tests see every module of their phase open; the closed-for-now ones (src/config/site.ts) are
    // tested with the list passed in, or with this stubbed (tests/unit/proxy.test.ts).
    env: { NEXT_PUBLIC_CLOSED_MODULES: 'none' },
    server: {
      deps: {
        // next-intl's ESM imports "next/server" without an extension; let Vite resolve it.
        inline: ['next-intl'],
      },
    },
  },
})
