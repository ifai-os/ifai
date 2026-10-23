import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests. Locally and in CI they run against `pnpm start` (build first).
 * Set BASE_URL to test a deployed preview instead; if the preview is behind
 * Vercel Deployment Protection, also set VERCEL_AUTOMATION_BYPASS_SECRET.
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    // A trace records request headers, so it would carry the bypass secret into the uploaded report.
    trace: bypass ? 'off' : 'retain-on-failure',
    // The header goes on every request. Asking Vercel to set the bypass cookie instead would answer
    // the first request with a 307, which breaks the tests that check a status without following redirects.
    extraHTTPHeaders: bypass ? { 'x-vercel-protection-bypass': bypass } : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: point at a preinstalled Chromium instead of `playwright install`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm start',
        url: 'http://localhost:3000/en',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
