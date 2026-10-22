import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')

test('the daily list opens', async ({ page }) => {
  const response = await page.goto('/en/daily')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.daily.title })).toBeVisible()
  await expect(page.getByRole('navigation', { name: en.daily.filterLabel })).toBeVisible()
})

test('unknown stories, categories and pages answer 404', async ({ page }) => {
  for (const path of ['/en/daily/not-a-story', '/en/daily/category/not-a-category', '/en/daily?page=0', '/en/daily?page=x']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
})

test('every language has an RSS feed', async ({ request }) => {
  for (const locale of ['en', 'zh-hans', 'zh-hant', 'ja', 'ko']) {
    const response = await request.get(`/${locale}/daily/rss.xml`)
    expect(response.status(), locale).toBe(200)
    expect(response.headers()['content-type']).toContain('application/rss+xml')
    expect(await response.text()).toContain('<rss')
  }
})

// Needs the sample stories from scripts/seed-stories.ts: CI adds them; preview databases don't have them.
test.describe('with the sample stories', () => {
  test.skip(!process.env.E2E_SAMPLE_STORIES, 'Run `pnpm payload run scripts/seed-stories.ts` and set E2E_SAMPLE_STORIES=1.')

  const titles = {
    workspaces: 'Sample: Lumen Chat adds shared workspaces for teams',
    weights: 'Sample: Kitecode publishes the weights of its code model',
    benchmark: 'Sample: Orbit Notes reports a new summarization benchmark',
    preview: 'Sample: Lumen Chat previews team workspaces',
  }

  test('lists published stories newest first and leaves pending and withdrawn ones out', async ({ page }) => {
    await page.goto('/en/daily')
    const main = page.getByRole('main')
    const links = main.getByRole('link', { name: /^Sample: / })
    await expect(links).toHaveText([titles.workspaces, titles.weights, titles.benchmark, titles.preview])
    await expect(main.getByText('Sample pending story')).toHaveCount(0)
    await expect(main.getByText('Sample withdrawn story')).toHaveCount(0)
    await expect(main.getByText('2 more outlets reported this')).toBeVisible()
    await expect(main.getByText('Open a workspace and invite a teammate.')).toBeVisible()
  })

  test.describe('in Tokyo', () => {
    test.use({ timezoneId: 'Asia/Tokyo' })

    test('shows local times and groups by the local day', async ({ page }) => {
      await page.goto('/en/daily')
      const row = page.getByRole('article').filter({ hasText: titles.benchmark })
      // 2026-10-20T08:15Z is 17:15 in Tokyo, still October 20.
      await expect(row.locator('time[datetime="2026-10-20T08:15:00.000Z"]')).toHaveText(/5:15\sPM/)
      await expect(page.getByRole('heading', { level: 2, name: 'Tuesday, October 20' })).toBeVisible()
      // The newest sample story was published a minute ago, so the first group is today.
      await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(en.daily.today)
    })
  })

  test.describe('in Los Angeles', () => {
    test.use({ timezoneId: 'America/Los_Angeles' })

    test('shows the same instant as the morning of the same day', async ({ page }) => {
      await page.goto('/en/daily')
      const row = page.getByRole('article').filter({ hasText: titles.benchmark })
      await expect(row.locator('time[datetime="2026-10-20T08:15:00.000Z"]')).toHaveText(/1:15\sAM/)
      await expect(page.getByRole('heading', { level: 2, name: 'Tuesday, October 20' })).toBeVisible()
    })
  })

  test('filters by category', async ({ page }) => {
    await page.goto('/en/daily/category/open')
    await expect(page.getByRole('heading', { level: 1, name: en.categories.open })).toBeVisible()
    const filter = page.getByRole('navigation', { name: en.daily.filterLabel })
    await expect(filter.getByRole('link', { name: en.categories.open })).toHaveAttribute('aria-current', 'page')
    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: titles.weights })).toBeVisible()
    await expect(main.getByRole('link', { name: titles.workspaces })).toHaveCount(0)

    await filter.getByRole('link', { name: en.categories.product }).click()
    await expect(page).toHaveURL(/\/en\/daily\/category\/product$/)
    await expect(main.getByRole('link', { name: titles.workspaces })).toBeVisible()
  })

  test('an empty category says so and links to every story', async ({ page }) => {
    await page.goto('/en/daily/category/design')
    await expect(page.getByText(en.daily.emptyCategoryTitle)).toBeVisible()
    await page.getByRole('link', { name: en.daily.allStories }).click()
    await expect(page).toHaveURL(/\/en\/daily$/)
  })

  test("a story's page has its sources, original first, and the other developments of its event", async ({ page }) => {
    const response = await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: titles.workspaces })).toBeVisible()
    const sources = page.getByRole('region', { name: /^Sources/ })
    await expect(sources.getByRole('link')).toHaveText([/Lumen Labs/, /Sample Tech News/, /Another Outlet/, /Hacker News/])
    await expect(sources.getByRole('link').first()).toHaveAttribute('href', 'https://lumen-chat.example/blog/shared-workspaces')
    await expect(sources.getByText(en.daily.roles.original)).toBeVisible()
    const developments = page.getByRole('region', { name: en.daily.developments })
    await expect(developments.getByRole('link', { name: new RegExp(titles.preview) })).toHaveAttribute(
      'href',
      '/en/daily/sample-lumen-chat-announces-workspaces',
    )
    await expect(page.getByRole('button', { name: en.daily.share })).toBeVisible()
  })

  test('a corrected story shows when it was corrected', async ({ page }) => {
    await page.goto('/en/daily/sample-orbit-notes-benchmark')
    await expect(page.getByRole('note')).toContainText(en.daily.corrected)
  })

  test('pending and withdrawn stories have no page', async ({ page }) => {
    for (const slug of ['sample-pending-story', 'sample-withdrawn-story']) {
      const response = await page.goto(`/en/daily/${slug}`)
      expect(response?.status(), slug).toBe(404)
    }
  })

  test("text missing in the reader's language falls back to English, marked as English", async ({ page }) => {
    await page.goto('/ko/daily/sample-kitecode-opens-its-model-weights')
    await expect(page.getByRole('heading', { level: 1, name: titles.weights })).toHaveAttribute('lang', 'en')
  })

  test('Traditional Chinese is converted from Simplified', async ({ page }) => {
    await page.goto('/zh-hant/daily')
    await expect(page.getByRole('main').getByRole('link', { name: /團隊共享工作區/ })).toBeVisible()
  })

  test("the feed lists the published stories in the feed's language", async ({ request }) => {
    const xml = await (await request.get('/zh-hans/daily/rss.xml')).text()
    expect(xml).toContain('示例：Lumen Chat 推出团队共享工作区')
    expect(xml).toContain('/zh-hans/daily/sample-lumen-chat-adds-shared-workspaces')
    expect(xml).not.toContain('示例待审新闻')
    expect(xml).not.toContain('示例已撤回新闻')
  })

  test("the home page leads with today's stories", async ({ page }) => {
    await page.goto('/en')
    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: titles.workspaces })).toHaveAttribute(
      'href',
      '/en/daily/sample-lumen-chat-adds-shared-workspaces',
    )
    await expect(main.getByRole('link', { name: titles.preview })).toHaveCount(0)
  })
})
