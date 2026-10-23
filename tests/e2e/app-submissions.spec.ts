import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import pg from 'pg'

import type enMessages from '../../messages/en.json'
import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const s = en.appSubmissions
const f = s.form

const needsMembers = () =>
  test.skip(
    !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
    'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
  )

async function query<Row extends object>(text: string, values: unknown[]): Promise<Row[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  try {
    return (await client.query<Row>(text, values)).rows
  } finally {
    await client.end()
  }
}

test('the submissions API takes members from IFAI’s own pages only', async ({ request }) => {
  const submission = { website: 'https://smoke-app.example', name: 'Smoke App', email: 'dev@example.com', locale: 'en' }
  const visitor = await request.post('/api/app-submissions/new', { data: submission })
  expect(visitor.status()).toBe(401)
  expect(visitor.headers()['cache-control']).toBe('private, no-store')
  const fromElsewhere = await request.post('/api/app-submissions/new', { data: submission, headers: { 'sec-fetch-site': 'cross-site' } })
  expect(fromElsewhere.status()).toBe(403)
  const wrong = await request.post('/api/app-submissions/new', { data: { ...submission, website: 'http://127.0.0.1', email: 'nope' } })
  expect(wrong.status()).toBe(400)
  expect(await wrong.json()).toEqual({ error: 'invalid', fields: ['website', 'email'] })

  // Payload's own REST address for the collection, and the back office's panel, are for admins.
  expect((await request.post('/api/app-submissions', { data: { ...submission, status: 'accepted' } })).status()).toBe(403)
  expect((await request.get('/api/app-submissions')).status()).toBe(403)
  expect((await request.get('/api/app-submissions/1/handling')).status()).toBe(401)
})

test('the submit page asks a visitor to sign in first', async ({ page }) => {
  const response = await page.goto('/en/apps/submit?name=Smoke%20App')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: s.title })).toBeVisible()
  await expect(page.getByRole('navigation', { name: en.apps.breadcrumb }).getByRole('link', { name: en.apps.title })).toHaveAttribute('href', '/en/apps')
  const form = page.getByRole('region', { name: f.title })
  await expect(form.getByText(f.signIn)).toBeVisible()
  await expect(form.getByLabel(f.website)).toHaveCount(0)
  await expect(page.getByRole('region', { name: s.mine.title })).toHaveCount(0)
})

test('a member submits an app, gets its number and finds it under My submissions', async ({ page, context, baseURL }) => {
  needsMembers()
  const member = await createMember(baseURL ?? 'http://localhost:3000')
  const domain = `smoke-${randomUUID().slice(0, 8)}.example`
  try {
    await context.addCookies([member.cookie])
    // A search with no match passes its words on as the name.
    await page.goto('/en/apps/submit?name=Smoke%20App')
    const form = page.getByRole('region', { name: f.title })
    await expect(form.getByLabel(f.name)).toHaveValue('Smoke App')
    await expect(form.getByLabel(f.email)).toHaveValue(/^smoke-.+@example\.com$/)

    // Checked before sending: the first wrong field gets the focus.
    await form.getByRole('button', { name: f.send, exact: true }).click()
    await expect(form.getByText(f.errors.website)).toBeVisible()
    await expect(form.getByLabel(f.website)).toBeFocused()

    // Pasted from a directory, as people do: the tracking parameters are dropped.
    await form.getByLabel(f.website).fill(`www.${domain}/?utm_source=toolify`)
    await form.getByLabel(f.category).selectOption({ index: 1 })
    const category = await form.getByLabel(f.category).locator('option:checked').textContent()
    await form.getByLabel(f.note).fill('Turns a document into slides')
    await form.getByRole('button', { name: f.send, exact: true }).click()

    // 「提交成功」 takes the form's place and names the section.
    const sent = page.getByRole('region', { name: s.done.title })
    await expect(sent.getByRole('heading', { name: s.done.title })).toBeFocused()
    await expect(sent.getByText('Smoke App', { exact: true })).toBeVisible()
    await expect(sent.getByRole('listitem').filter({ hasText: s.done.steps.review })).toHaveAttribute('aria-current', 'step')
    const meta = await sent.getByText(/Submission number A-\d{4}-\d{2,}$/).textContent()
    expect(meta).toContain(`${category} · `)
    const code = meta?.replace(/^.*Submission number /, '')

    const [row] = await query<{ website: string; domain: string; status: string; locale: string; note: string }>(
      'select website, domain, status, locale, note from app_submissions where code = $1',
      [code],
    )
    expect(row).toEqual({ website: `https://www.${domain}`, domain, status: 'pending', locale: 'en', note: 'Turns a document into slides' })

    // 「我的提交」 is read again with the new one in it.
    const mine = page.getByRole('region', { name: s.mine.title })
    await expect(mine.getByRole('listitem').filter({ hasText: domain })).toContainText(s.mine.status.pending)
    await expect(mine.getByText('Smoke App', { exact: true })).toHaveAttribute('lang', 'en')
    await sent.getByRole('button', { name: s.done.mine }).click()
    await expect(mine.getByRole('heading', { name: s.mine.title })).toBeFocused()

    // The same website again while it waits: the same submission.
    const again = await page.request.post('/api/app-submissions/new', {
      data: { website: `https://${domain}/pricing`, name: 'Smoke App again', email: 'dev@example.com', locale: 'en' },
    })
    expect(again.status()).toBe(200)
    expect(await again.json()).toMatchObject({ code, name: 'Smoke App' })

    await sent.getByRole('button', { name: s.done.again }).click()
    await expect(form.getByLabel(f.website)).toHaveValue('')
    await expect(form.getByLabel(f.website)).toBeFocused()
    await expect(form.getByLabel(f.name)).toHaveValue('')
  } finally {
    await member.remove()
  }
})

test('the list leads to the submit page', async ({ page }) => {
  await page.goto('/en/apps')
  const how = page.getByRole('region', { name: en.apps.howTitle })
  await expect(how.getByRole('link', { name: `${en.apps.submitLink} ›` })).toHaveAttribute('href', '/en/apps/submit')

  await page.setViewportSize({ width: 390, height: 844 })
  const card = page.getByRole('region', { name: en.apps.submitCard.title })
  await expect(card.getByRole('link', { name: en.apps.submitApp })).toHaveAttribute('href', '/en/apps/submit')
})

test('the submit page is in the sitemap, in every language', async ({ request }) => {
  const pages = await (await request.get('/sitemaps/pages-1.xml')).text()
  for (const prefix of ['/en', '/zh-hans', '/zh-hant', '/ja', '/ko']) expect(pages).toContain(`${prefix}/apps/submit</loc>`)
})

test('a search with no match offers to submit the app', async ({ page }) => {
  await page.goto('/en/apps?q=nothing-matches-this')
  await expect(page.getByText(en.apps.noMatchBody)).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: en.apps.submitApp })).toHaveAttribute(
    'href',
    '/en/apps/submit?name=nothing-matches-this',
  )
})

// Needs the sample apps from scripts/seed-apps.ts: CI adds them; preview databases don't have them.
test.describe('with the sample apps', () => {
  test.skip(!process.env.E2E_SAMPLE_APPS, 'Run `pnpm payload run scripts/seed-apps.ts` and set E2E_SAMPLE_APPS=1.')

  test('an app that is already listed is pointed at instead of submitted', async ({ page, context, baseURL }) => {
    needsMembers()
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      await page.goto('/en/apps/submit')
      const form = page.getByRole('region', { name: f.title })
      await form.getByLabel(f.website).fill('https://www.kitecode.example/pricing')
      await form.getByLabel(f.name).fill('Kitecode')
      const sent = page.waitForResponse((response) => response.url().endsWith('/api/app-submissions/new'))
      await form.getByRole('button', { name: f.send, exact: true }).click()
      expect((await sent).status()).toBe(409)
      const listed = form.getByRole('alert')
      await expect(listed).toContainText('Kitecode is already listed.')
      await expect(listed.getByRole('link', { name: 'Kitecode' })).toHaveAttribute('href', '/en/apps/kitecode')
      expect(await query('select id from app_submissions where domain = $1', ['kitecode.example'])).toEqual([])
    } finally {
      await member.remove()
    }
  })
})
