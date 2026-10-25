import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Links must keep the locale prefix (AGENTS.md rule 5).
const localeLinks = [
  {
    name: 'next/link',
    message: 'Use Link from @/i18n/navigation so links keep the locale prefix.',
  },
  {
    name: 'next/navigation',
    importNames: ['useRouter', 'usePathname', 'redirect', 'permanentRedirect'],
    message: 'Use the locale-aware versions from @/i18n/navigation.',
  },
]

// Vercel shares the data cache across Preview deployments: keys and tags go through @/lib/data-cache.
const dataCache = {
  name: 'next/cache',
  importNames: ['unstable_cache', 'cacheTag'],
  message: 'Use cached() from @/lib/data-cache, so the key and tags are scoped to this database.',
}

const modelSdks = {
  regex: '^(ai|ai/.*|@ai-sdk/.*|@openrouter/.*)$',
  message: 'Call models through @/lib/ai: name a purpose, not a model.',
}

const modelClient = {
  regex: '^@/lib/ai(/.*)?$',
  message: 'Pages and components never call models; do it in a background job.',
}

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
      'no-restricted-imports': ['error', { paths: [...localeLinks, dataCache], patterns: [modelSdks] }],
    },
  },
  {
    // Model calls go through src/lib/ai only (AGENTS.md rule 8); tests use the SDK's mocks.
    files: ['src/lib/ai/**', 'tests/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [...localeLinks, dataCache] }] },
  },
  {
    // Pages and components never call models.
    files: ['src/app/(frontend)/**', 'src/components/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...localeLinks, dataCache], patterns: [modelSdks, modelClient] }],
    },
  },
  {
    files: ['src/lib/data-cache.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: localeLinks, patterns: [modelSdks] }] },
  },
  {
    files: ['src/i18n/navigation.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
])
