import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'next-env.d.ts',
    'src/payload-types.ts',
    'src/migrations/**',
    'src/app/(payload)/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    rules: {
      // Links must keep the locale prefix (AGENTS.md rule 5).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/link',
              message: 'Use Link from @/i18n/navigation so links keep the locale prefix.',
            },
            {
              name: 'next/navigation',
              importNames: ['useRouter', 'usePathname', 'redirect', 'permanentRedirect'],
              message: 'Use the locale-aware versions from @/i18n/navigation.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/i18n/navigation.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
])
