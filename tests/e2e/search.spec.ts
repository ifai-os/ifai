import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

type Messages = typeof enMessages

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as Messages

test('the header search opens the search page, which stays out of search engines', async ({ page }) => {
  await page.goto('/en')
  await page.getByRole('banner').getByRole('link', { name: en.header.search }).click()
  await expect(page).toHaveURL(/\/en\/search$/)
  await expect(page.getByRole('heading', { level: 1, name: en.search.title })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: en.search.label })).toBeFocused()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('a search with no match keeps the words and says so', async ({ page }) => {
  await page.goto('/en/search?q=qqzzxxnothing')
  await expect(page.getByRole('searchbox', { name: en.search.label })).toHaveValue('qqzzxxnothing')
  await expect(page.getByText(en.search.noMatchTitle.replace('{q}', 'qqzzxxnothing'))).toBeVisible()
})

test('unknown pages answer 404', async ({ page }) => {
  for (const path of ['/en/search?q=x&page=0', '/en/search?q=x&page=x', '/en/search?page=2', '/en/search?q=qqzzxxnothing&type=apps&page=2']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
})

test('the 404 page can search', async ({ page }) => {
  await page.goto('/en/not-a-page')
  const box = page.getByRole('searchbox', { name: en.search.label })
  await box.fill('anything')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/en\/search\?q=anything$/)
})

// Needs the samples from scripts/seed-apps.ts, seed-skills.ts and seed-stories.ts, as CI adds them.
test.describe('with the sample content', () => {
  test.skip(
    !process.env.E2E_SAMPLE_APPS || !process.env.E2E_SAMPLE_SKILLS || !process.env.E2E_SAMPLE_STORIES,
    'Run the three seed scripts and set E2E_SAMPLE_APPS, E2E_SAMPLE_SKILLS and E2E_SAMPLE_STORIES.',
  )

  test('finds stories and apps under「All」, each marked with its kind', async ({ page }) => {
    await page.goto('/en/search?q=lumen')
    const main = page.getByRole('main')
    await expect(main.getByRole('status')).toHaveText('3 results for “lumen”')
    const daily = main.getByRole('region', { name: en.search.tabs.daily })
    await expect(daily.getByRole('link')).toHaveCount(2)
    const apps = main.getByRole('region', { name: en.search.tabs.apps })
    await expect(apps.getByRole('link', { name: /^Lumen Chat/ })).toContainText(en.search.kind.apps)
    await expect(main.getByRole('region', { name: en.search.tabs.skills })).toHaveCount(0)

    await main.getByRole('navigation', { name: en.search.typesLabel }).getByRole('link', { name: /^Daily/ }).click()
    await expect(page).toHaveURL(/\/en\/search\?q=lumen&type=daily$/)
    await expect(main.getByRole('link', { name: /^Sample: / })).toHaveCount(2)
    await expect(main.getByRole('link', { name: /^Lumen Chat/ })).toHaveCount(0)
  })

  test('searches every language and leaves out what is not published', async ({ page }) => {
    // 「团队」is only in the Chinese titles of the sample stories.
    await page.goto('/en/search?q=%E5%9B%A2%E9%98%9F')
    await expect(page.getByRole('main').getByRole('link', { name: /Lumen Chat/ }).first()).toBeVisible()

    for (const q of ['withdrawn story', 'pending story', 'Draft Demo', 'Draft Sample Skill', 'Delisted Sample Skill']) {
      await page.goto(`/en/search?q=${encodeURIComponent(q)}`)
      await expect(page.getByText(en.search.noMatchTitle.replace('{q}', q)), q).toBeVisible()
    }
  })

  test('finds a Skill and offers popular searches', async ({ page }) => {
    await page.goto('/en/search?q=sql')
    await expect(page.getByRole('main').getByRole('link', { name: /^SQL Helper/ })).toContainText(en.search.kind.skills)

    await page.goto('/en/search')
    await page.getByRole('region', { name: en.search.popular }).getByRole('link', { name: 'Lumen Chat' }).click()
    await expect(page).toHaveURL(/\/en\/search\?q=Lumen\+Chat$/)
  })
})
