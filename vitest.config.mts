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
    server: {
      deps: {
        // next-intl's ESM imports "next/server" without an extension; let Vite resolve it.
        inline: ['next-intl'],
      },
    },
  },
})
