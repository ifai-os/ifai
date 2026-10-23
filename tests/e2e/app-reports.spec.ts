import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import pg from 'pg'

import type enMessages from '../../messages/en.json'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const r = en.appReports

test('the reports API checks what it is sent, and only takes reports from IFAI’s pages', async ({ request }) => {
  const report = { app: 2000000000, kind: 'wrong-info', body: 'The price is wrong', locale: 'en' }
  const post = (data: object, headers?: Record<string, string>) => request.post('/api/app-reports/new', { data, headers })
  expect((await post({ ...report, kind: 'spam' })).status()).toBe(400)
  expect((await post({ ...report, body: ' ' })).status()).toBe(400)
  expect((await post({ ...report, locale: 'fr' })).status()).toBe(400)
  const missing = await post(report)
  expect(missing.status()).toBe(404)
  expect(missing.headers()['cache-control']).toBe('private, no-store')
  expect((await post(report, { 'sec-fetch-site': 'cross-site' })).status()).toBe(403)

  // Payload's own REST address for the collection neither takes reports nor shows them.
  expect((await request.post('/api/app-reports', { data: { app: 1, kind: 'other', reporter: 'v:x' } })).status()).toBe(403)
  expect((await request.get('/api/app-reports')).status()).toBe(403)
  expect((await request.get('/api/apps/reports')).status()).toBe(401)
})

// Needs the sample apps from scripts/seed-apps.ts: CI adds them; preview databases don't have them.
test.describe('with the sample apps', () => {
  test.skip(!process.env.E2E_SAMPLE_APPS, 'Run `pnpm payload run scripts/seed-apps.ts` and set E2E_SAMPLE_APPS=1.')

  // In every report this worker sends, to find them and clean them up.
  const marker = `smoke-${randomUUID()}`
  // Visitors count by IP and user agent, ten reports a day each: every test is a visitor of its own.
  const visitor = (name: string) => `Mozilla/5.0 (IFAI smoke test; ${name}; ${marker})`

  async function query<Row extends object>(text: string, values: unknown[]): Promise<Row[]> {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
    await client.connect()
    try {
      return (await client.query<Row>(text, values)).rows
    } finally {
      await client.end()
    }
  }

  test.afterAll(async () => {
    await query('delete from app_reports where body like $1', [`%${marker}%`])
  })

  test.describe('from the page', () => {
    test.use({ userAgent: visitor('dialog') })

    test('a visitor tells us what is wrong with an app’s page', async ({ page }) => {
      await page.goto('/en/apps/kitecode')
      // The sample apps have no website image, so the link is at the foot of the page.
      await page.getByRole('button', { name: r.linkLong }).click()
      const dialog = page.getByRole('dialog', { name: 'Something wrong with Kitecode?' })
      await expect(dialog).toBeVisible()

      const send = dialog.getByRole('button', { name: r.send, exact: true })
      await send.click()
      await expect(dialog.getByRole('alert')).toHaveText(r.errors.kind)
      const wrongInfo = dialog.getByRole('radio', { name: new RegExp(`^${r.kinds['wrong-info']}`) })
      await wrongInfo.check()
      await send.click()
      await expect(dialog.getByRole('alert')).toHaveText(r.errors.body)

      // An app that has shut down needs no details.
      await dialog.getByRole('radio', { name: new RegExp(`^${r.kinds['shut-down']}`) }).check()
      await expect(dialog.getByRole('textbox', { name: r.bodyOptional, exact: true })).toBeVisible()
      await wrongInfo.check()

      await dialog.getByRole('textbox', { name: r.bodyLabel, exact: true }).fill(`It no longer has a free plan. ${marker}`)
      await dialog.getByRole('textbox', { name: r.contactLabel, exact: true }).fill('reader@example.com')
      const sent = page.waitForResponse((response) => response.url().endsWith('/api/app-reports/new'))
      await send.click()
      expect((await sent).status()).toBe(200)
      await expect(dialog.getByRole('status')).toHaveText(r.done)
      await dialog.getByRole('button', { name: en.states.dismiss }).first().click()
      await expect(dialog).toBeHidden()

      const rows = await query<{ kind: string; contact: string; page_locale: string; status: string; reporter: string }>(
        'select kind, contact, page_locale, status, reporter from app_reports where body like $1',
        [`%${marker}%`],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: 'wrong-info', contact: 'reader@example.com', page_locale: 'en', status: 'open' })
      expect(rows[0].reporter).toMatch(/^v:/)
    })
  })

  test.describe('the daily limit', () => {
    test.use({ userAgent: visitor('limit') })

    test('a visitor sends at most ten reports a day', async ({ page }) => {
      await page.goto('/en/apps/lumen-chat')
      const [app] = await query<{ id: number }>("select id from apps where slug = 'lumen-chat'", [])
      // From the page, as the dialog sends them, so the visitor is the browser's own.
      const statuses = await page.evaluate(
        async ({ id, body }) => {
          const results: number[] = []
          for (let i = 0; i < 11; i += 1) {
            const response = await fetch('/api/app-reports/new', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ app: id, kind: 'shut-down', body: `${body} ${i}`, locale: 'en' }),
            })
            results.push(response.status)
          }
          return results
        },
        { id: app.id, body: marker },
      )
      expect(statuses).toEqual([...Array<number>(10).fill(200), 429])
    })
  })
})
