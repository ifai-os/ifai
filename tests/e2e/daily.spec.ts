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

test('unknown stories, categories, pages and posters answer 404', async ({ page, request }) => {
  for (const path of [
    '/en/daily/not-a-story',
    '/en/daily/category/not-a-category',
    '/en/daily/tag/not-a-tag',
    '/en/daily?page=0',
    '/en/daily?page=x',
    '/en/daily/poster/2020-01-01',
    '/en/daily/poster/2026-02-30',
    '/en/daily/poster/not-a-date',
  ]) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
  for (const path of ['/en/daily/poster/2020-01-01/image.png', '/en/daily/poster/not-a-date/image.png', '/xx/daily/poster/2020-01-01/image.png']) {
    expect((await request.get(path)).status(), path).toBe(404)
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
    const rows = page.getByRole('article')
    await expect(rows.getByRole('link', { name: /^Sample: / })).toHaveText([titles.workspaces, titles.weights, titles.benchmark, titles.preview])
    await expect(main.getByText('Sample pending story')).toHaveCount(0)
    await expect(main.getByText('Sample withdrawn story')).toHaveCount(0)
    await expect(rows.filter({ hasText: titles.workspaces }).getByText('2 more outlets reported this')).toBeVisible()
    await expect(main.getByText('Open a workspace and invite a teammate.')).toBeVisible()
  })

  test("today's hottest story leads, and the hottest events of 48 hours are listed once each", async ({ page }) => {
    await page.goto('/en/daily')
    const hottest = page.getByRole('region', { name: titles.workspaces })
    await expect(hottest).toContainText(`${en.daily.hottest} · ${en.categories.product} · 2 more outlets reported this`)
    await expect(hottest.getByRole('link')).toHaveAttribute('href', '/en/daily/sample-lumen-chat-adds-shared-workspaces')

    const hot = page.getByRole('region', { name: en.daily.hotTitle })
    // One story per event (the earlier Lumen Chat story shares its event); withdrawn and pending ones never show.
    await expect(hot.getByRole('link')).toHaveText([titles.workspaces, titles.weights, titles.benchmark])
    const items = hot.getByRole('listitem')
    await expect(items.nth(0)).toContainText(`3 outlets${en.daily.trend.new}`)
    await expect(items.nth(1)).toContainText(`1 outlet${en.daily.trend.rising}`)
    await expect(items.nth(2)).toHaveText(/2 outlets$/)

    // Categories and later pages keep the hot list but not the hottest story.
    await page.goto('/en/daily/category/open')
    await expect(page.getByText(en.daily.hottest)).toHaveCount(0)
    await expect(page.getByRole('region', { name: en.daily.hotTitle })).toBeVisible()
  })

  test("the list leads to the day's poster: the stories on it and its image in every language", async ({ page, request }) => {
    await page.goto('/en/daily')
    const save = page.getByRole('link', { name: en.poster.save })
    await expect(save).toHaveAttribute('download', /^ifai-\d{4}-\d{2}-\d{2}-en\.png$/)
    await expect(save).toHaveAttribute('href', /^\/en\/daily\/poster\/\d{4}-\d{2}-\d{2}\/image\.png\?v=\w+$/)
    await page.getByRole('link', { name: en.poster.title, exact: true }).click()
    await expect(page).toHaveURL(/\/en\/daily\/poster\/\d{4}-\d{2}-\d{2}$/)
    const date = new URL(page.url()).pathname.split('/').at(-1)
    await expect(page.getByRole('heading', { level: 1, name: en.poster.title })).toBeVisible()

    // Chosen automatically, the hottest story first.
    const stories = page.getByRole('region', { name: en.poster.stories }).getByRole('link')
    await expect(stories.first()).toHaveText(titles.workspaces)
    await expect(stories.first()).toHaveAttribute('href', '/en/daily/sample-lumen-chat-adds-shared-workspaces')

    const image = new RegExp(`/en/daily/poster/${date}/image\\.png\\?v=\\w+$`)
    await expect(page.getByRole('img', { name: /^Poster of the AI highlights of / })).toHaveAttribute('src', image)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', image)

    const downloads = page.getByRole('region', { name: en.poster.downloads }).getByRole('link')
    await expect(downloads).toHaveCount(5)
    for (const [index, locale] of ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'].entries()) {
      const link = downloads.nth(index)
      await expect(link).toHaveAttribute('download', `ifai-${date}-${locale}.png`)
      const href = await link.getAttribute('href')
      expect(href, locale).toMatch(new RegExp(`^/${locale.toLowerCase()}/daily/poster/${date}/image\\.png\\?v=`))
      const response = await request.get(href!)
      expect(response.status(), locale).toBe(200)
      expect(response.headers()['content-type'], locale).toBe('image/png')
      expect((await response.body()).byteLength, locale).toBeGreaterThan(10_000)
    }
  })

  test("the apps in today's stories link to their pages", async ({ page }) => {
    test.skip(!process.env.E2E_SAMPLE_APPS, 'Also needs the sample apps from scripts/seed-apps.ts (run before or after the sample stories).')
    await page.goto('/en/daily')
    const apps = page.getByRole('region', { name: en.daily.appsToday })
    await apps.getByRole('link', { name: 'Lumen Chat' }).click()
    await expect(page).toHaveURL(/\/en\/apps\/lumen-chat$/)
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
      await expect(page.locator('[id^="day-"]').first()).toHaveText(en.daily.today)
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

  test('day headings put the count on the same line, with a space before the weekday in Chinese', async ({ page }) => {
    await page.goto('/zh-hans/daily')
    const day = page.locator('header').filter({ has: page.getByRole('heading', { level: 2, name: /^10月20日 星期二$/ }) })
    await expect(day).toContainText('1 条')
  })

  test('a picture shows beside its story and on its page; a video plays in a dialog', async ({ page }) => {
    await page.goto('/en/daily')
    const pictured = page.getByRole('article').filter({ hasText: titles.workspaces })
    await expect(pictured.locator('img').first()).toHaveAttribute('src', /\/_next\/image\?url=%2Fapi%2Fmedia%2Ffile%2F/)

    const play = page.getByRole('button', { name: `Play video: ${titles.weights}` })
    await expect(page.locator('iframe')).toHaveCount(0)
    await play.click()
    const dialog = page.getByRole('dialog', { name: titles.weights })
    await expect(dialog.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/M7lc1UVf-VE\?autoplay=1/)
    await page.keyboard.press('Escape')
    await expect(page.locator('iframe')).toHaveCount(0)

    await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    await expect(page.getByRole('img', { name: titles.workspaces })).toBeVisible()
    await expect(page.getByText('Image: Lumen Labs')).toBeVisible()
  })

  test('filters by category', async ({ page }) => {
    await page.goto('/en/daily/category/open')
    await expect(page.getByRole('heading', { level: 1, name: en.categories.open })).toBeVisible()
    const filter = page.getByRole('navigation', { name: en.daily.filterLabel })
    await expect(filter.getByRole('link', { name: en.categories.open })).toHaveAttribute('aria-current', 'page')
    const rows = page.getByRole('article')
    await expect(rows.getByRole('link', { name: titles.weights })).toBeVisible()
    await expect(rows.getByRole('link', { name: titles.workspaces })).toHaveCount(0)

    await filter.getByRole('link', { name: en.categories.product }).click()
    await expect(page).toHaveURL(/\/en\/daily\/category\/product$/)
    await expect(rows.getByRole('link', { name: titles.workspaces })).toBeVisible()
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

  test("a story's page has its industry tags, companies and products, and its topic", async ({ page }) => {
    await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    const topic = page.getByRole('region', { name: new RegExp(en.daily.topic) })
    await expect(topic.getByText(en.daily.thisStory)).toBeVisible()
    await expect(topic.getByRole('link', { name: titles.preview })).toHaveAttribute('href', '/en/daily/sample-lumen-chat-announces-workspaces')
    const entities = page.getByRole('region', { name: en.daily.entities })
    await expect(entities.getByText('Lumen Labs')).toBeVisible()
    await page.getByRole('region', { name: en.daily.tags }).getByRole('link', { name: en.tags.enterprise }).click()
    await expect(page).toHaveURL(/\/en\/daily\/tag\/enterprise$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${en.tags.enterprise} · Daily`)
    // Listed by day and again in the hot list beside it.
    await expect(page.getByRole('link', { name: titles.workspaces }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: titles.preview })).toHaveCount(0)
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
    await expect(page.getByRole('article').getByRole('link', { name: /團隊共享工作區/ })).toBeVisible()
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
