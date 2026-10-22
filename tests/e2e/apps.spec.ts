import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')
const zhHant = load('zh-hant')

test('the apps list opens', async ({ page }) => {
  const response = await page.goto('/en/apps')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.apps.title })).toBeVisible()
  await expect(page.getByRole('search')).toBeVisible()
  await expect(page.getByRole('navigation', { name: en.apps.filterLabel })).toBeVisible()
})

test('unknown categories, apps and pages answer 404', async ({ page }) => {
  for (const path of ['/en/apps/category/not-a-category', '/en/apps/not-an-app', '/en/apps?page=0', '/en/apps?page=x']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
})

// Needs the sample apps from scripts/seed-apps.ts: CI adds them; preview databases don't have them.
test.describe('with the sample apps', () => {
  test.skip(!process.env.E2E_SAMPLE_APPS, 'Run `pnpm payload run scripts/seed-apps.ts` and set E2E_SAMPLE_APPS=1.')

  const appLink = (name: string) => new RegExp(`^${name}\\b`)

  test('lists published apps A–Z and leaves drafts out', async ({ page }) => {
    await page.goto('/en/apps')
    const main = page.getByRole('main')
    await expect(main.getByText(/^3 apps listed$/)).toBeVisible()
    const rows = main.getByRole('link', { name: /^(Kitecode|Lumen Chat|Orbit Notes)\b/ })
    await expect(rows).toHaveText([/Kitecode/, /Lumen Chat/, /Orbit Notes/])
    await expect(main.getByText('Draft Demo')).toHaveCount(0)
  })

  test('categories include apps listed there as a second category', async ({ page }) => {
    await page.goto('/en/apps/category/assistants')
    await expect(page.getByRole('heading', { level: 1, name: 'AI assistants' })).toBeVisible()
    const filter = page.getByRole('navigation', { name: en.apps.filterLabel })
    await expect(filter.getByRole('link', { name: /^AI assistants/ })).toHaveAttribute('aria-current', 'page')
    for (const name of ['Kitecode', 'Lumen Chat', 'Orbit Notes']) {
      await expect(page.getByRole('main').getByRole('link', { name: appLink(name) })).toBeVisible()
    }

    await filter.getByRole('link', { name: /^Coding/ }).click()
    await expect(page).toHaveURL(/\/en\/apps\/category\/coding$/)
    await expect(page.getByRole('main').getByRole('link', { name: appLink('Kitecode') })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: appLink('Lumen Chat') })).toHaveCount(0)
  })

  test('an empty category says so and links to all apps', async ({ page }) => {
    await page.goto('/en/apps/category/music')
    await expect(page.getByText(en.apps.emptyCategoryTitle)).toBeVisible()
    await page.getByRole('link', { name: en.apps.allApps }).click()
    await expect(page).toHaveURL(/\/en\/apps$/)
  })

  test('search matches names and summaries in every language', async ({ page }) => {
    await page.goto('/en/apps')
    await page.getByRole('searchbox', { name: en.apps.searchLabel }).fill('lumen')
    await page.getByRole('button', { name: en.apps.searchSubmit }).click()
    await expect(page).toHaveURL(/\/en\/apps\?q=lumen$/)
    await expect(page.getByRole('main').getByRole('link', { name: appLink('Lumen Chat') })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: appLink('Kitecode') })).toHaveCount(0)

    await page.goto('/zh-hans/apps?q=代码')
    await expect(page.getByRole('main').getByRole('link', { name: appLink('Kitecode') })).toBeVisible()
  })

  test('a search with no match offers to clear it', async ({ page }) => {
    await page.goto('/en/apps/category/coding?q=nothing-matches-this')
    await expect(page.getByText('No apps match “nothing-matches-this”')).toBeVisible()
    await page.getByRole('link', { name: en.apps.searchEverywhere }).click()
    await expect(page).toHaveURL(/\/en\/apps\?q=nothing-matches-this$/)
    await page.getByRole('link', { name: en.apps.clearSearch }).first().click()
    await expect(page).toHaveURL(/\/en\/apps$/)
  })

  test("an app's page has its facts, FAQ and alternatives", async ({ page }) => {
    const response = await page.goto('/en/apps/lumen-chat')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Lumen Chat' })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(`^${en.apps.openSite}`) }).first()).toHaveAttribute(
      'href',
      '/en/apps/lumen-chat/visit',
    )
    // The visit route counts the click, then sends the reader on to the website.
    const visit = await page.request.get('/en/apps/lumen-chat/visit', { maxRedirects: 0 })
    expect(visit.status()).toBe(302)
    expect(visit.headers()['location']).toBe('https://lumen-chat.example/')
    expect(visit.headers()['cache-control']).toBe('no-store')
    await expect(page.getByText('There is a free plan and a paid plan.')).toBeVisible()

    // No alternatives were picked, so the page shows others from the same category.
    const alternatives = page.getByRole('region', { name: en.apps.alternatives })
    await expect(alternatives.getByRole('link')).toHaveText([/Kitecode/, /Orbit Notes/])
  })

  test('picked alternatives that are not published are left out', async ({ page }) => {
    await page.goto('/en/apps/kitecode')
    const alternatives = page.getByRole('region', { name: en.apps.alternatives })
    await expect(alternatives.getByRole('link')).toHaveText([/Lumen Chat/])
  })

  test('drafts have no page', async ({ page }) => {
    const response = await page.goto('/en/apps/draft-demo')
    expect(response?.status()).toBe(404)
  })

  test('text missing in the reader’s language falls back to English, marked as English', async ({ page }) => {
    await page.goto('/ko/apps/lumen-chat')
    await expect(page.getByText('Sample AI assistant for chat, writing and research')).toHaveAttribute('lang', 'en')
  })

  test('Traditional Chinese is converted from Simplified', async ({ page }) => {
    await page.goto('/zh-hant/apps/kitecode')
    await expect(page.getByRole('heading', { level: 2, name: zhHant.apps.about })).toBeVisible()
    await expect(page.locator('main p[lang="zh-Hant"]').first()).toContainText('編輯器')
  })
})
