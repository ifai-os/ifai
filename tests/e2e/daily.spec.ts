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
    // The categories before 2026-10-24 (docs/specs/daily.md「分类与分类页」).
    '/en/daily/category/product',
    '/en/daily/category/design',
    '/en/daily/category/tools?page=999',
    '/en/daily/tag/not-a-tag',
    '/en/daily/topic/nobodyhere',
    '/en/daily/topic/Not%20Compared',
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
    nimbus: 'Sample: Nimbus AI releases Nimbus 3, which reasons step by step',
    quill: 'Sample: Quill Labs raises a Series A to bring its writing assistant to teams',
    prism: 'Sample: Prism turns rough sketches into short videos',
    robot: 'Sample: Strider Robotics shows a warehouse robot that learns by watching',
  }

  test('lists published stories newest first and leaves pending and withdrawn ones out', async ({ page }) => {
    await page.goto('/en/daily')
    const main = page.getByRole('main')
    const rows = page.getByRole('article')
    await expect(rows.getByRole('link', { name: /^Sample: / })).toHaveText([
      titles.workspaces,
      titles.weights,
      titles.nimbus,
      titles.quill,
      titles.prism,
      titles.robot,
      titles.benchmark,
      titles.preview,
    ])
    await expect(main.getByText('Sample pending story')).toHaveCount(0)
    await expect(main.getByText('Sample withdrawn story')).toHaveCount(0)
    await expect(rows.filter({ hasText: titles.workspaces }).getByText('2 more outlets reported this')).toBeVisible()
    await expect(main.getByText('Open a workspace and invite a teammate.')).toBeVisible()
  })

  test("today's hottest story leads, and the hottest events of 48 hours are listed once each", async ({ page }) => {
    await page.goto('/en/daily')
    const hottest = page.getByRole('region', { name: titles.workspaces })
    await expect(hottest).toContainText(`${en.daily.hottest} · ${en.categories.tools} · 2 more outlets reported this`)
    await expect(hottest.getByRole('link')).toHaveAttribute('href', '/en/daily/sample-lumen-chat-adds-shared-workspaces')

    const hot = page.getByRole('region', { name: en.daily.hotTitle })
    // One story per event (the earlier Lumen Chat story shares its event); withdrawn and pending ones never show.
    await expect(hot.getByRole('link')).toHaveText([titles.workspaces, titles.weights, titles.benchmark, titles.nimbus, titles.quill])
    const items = hot.getByRole('listitem')
    await expect(items.nth(0)).toContainText(`3 outlets${en.daily.trend.new}`)
    await expect(items.nth(1)).toContainText(`1 outlet${en.daily.trend.rising}`)
    await expect(items.nth(2)).toHaveText(/2 outlets$/)

    // A tag's list keeps the hot list but not the hottest story; a category's page has neither (its board has no column).
    await page.goto('/en/daily/tag/assistants')
    await expect(page.getByText(en.daily.hottest)).toHaveCount(0)
    await expect(page.getByRole('region', { name: en.daily.hotTitle })).toBeVisible()
    await page.goto('/en/daily/category/open')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${en.categories.open}`)
    await expect(page.getByText(en.daily.hottest)).toHaveCount(0)
    await expect(page.getByRole('region', { name: en.daily.hotTitle })).toHaveCount(0)
  })

  test("the list leads to the day's poster: the stories on it and its image in every language", async ({ page, request }) => {
    await page.goto('/en/daily')
    const save = page.getByRole('link', { name: en.poster.save })
    await expect(save).toHaveAttribute('download', /^ifai-\d{4}-\d{2}-\d{2}-en\.png$/)
    await expect(save).toHaveAttribute('href', /^\/en\/daily\/poster\/\d{4}-\d{2}-\d{2}\/image\.png\?v=\w+$/)
    await page.getByRole('link', { name: en.poster.today, exact: true }).click()
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
      // The newest story leads the first group, under its Tokyo date. The samples go in minutes before
      // the tests, but a run around 15:00 UTC (Tokyo midnight) can put that date on Tokyo's yesterday.
      const tokyoDay = (at: Date) => at.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
      const first = page.locator('section[aria-labelledby^="day-"]').first()
      const newest = await first.locator('time[datetime]').first().getAttribute('datetime')
      const key = tokyoDay(new Date(newest!))
      await expect(first).toHaveAttribute('aria-labelledby', `day-${key}`)
      const today = tokyoDay(new Date())
      const yesterday = tokyoDay(new Date(Date.now() - 86_400_000))
      expect([today, yesterday]).toContain(key)
      await expect(first.getByRole('heading', { level: 2 })).toHaveText(key === today ? en.daily.today : en.daily.yesterday)
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

  test('day headings have no story count, with a space before the weekday in Chinese', async ({ page }) => {
    await page.goto('/zh-hans/daily')
    const day = page.locator('header').filter({ has: page.getByRole('heading', { level: 2, name: /^10月20日 星期二$/ }) })
    await expect(day).toBeVisible()
    await expect(day).not.toContainText('条')
    // A sample story went up exactly a day before the samples were added.
    await expect(page.getByRole('heading', { level: 2, name: '昨天' })).toBeVisible()
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
    // Vimeo too, asked not to track (dnt=1).
    await page.getByRole('button', { name: `Play video: ${titles.robot}` }).click()
    await expect(page.getByRole('dialog', { name: titles.robot }).locator('iframe')).toHaveAttribute(
      'src',
      'https://player.vimeo.com/video/76979871?autoplay=1&dnt=1',
    )
    await page.keyboard.press('Escape')
    await expect(page.locator('iframe')).toHaveCount(0)

    await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    await expect(page.getByRole('img', { name: titles.workspaces })).toBeVisible()
    await expect(page.getByText('Image: Lumen Labs')).toBeVisible()
  })

  test("a category's page has its banner, every category as pills, and its stories as cards", async ({ page }) => {
    await page.goto('/en/daily/category/tools')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${en.categories.tools}`)
    const banner = page.getByRole('region', { name: en.categories.tools })
    await expect(banner).toContainText(en.categoryAbout.tools)
    // The newest sample story came out minutes before the tests, so the update is today's: a time alone.
    await expect(banner).toContainText(/stor(y|ies) in the last 7 days · updated \d{1,2}:\d{2}\s[AP]M$/)
    await expect(page).toHaveTitle(new RegExp(`^${en.categories.tools} · Daily`))
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', en.categoryAbout.tools)

    const filter = page.getByRole('navigation', { name: en.daily.filterLabel })
    await expect(filter.getByRole('link')).toHaveCount(8)
    await expect(filter.getByRole('link', { name: en.categories.tools, exact: true })).toHaveAttribute('aria-current', 'page')
    const cards = page.getByRole('main').getByRole('article')
    // Newest first, under their times; the「试一试」in its grey box.
    await expect(cards.getByRole('link')).toHaveText([titles.workspaces, titles.preview])
    await expect(cards.first()).toContainText(`${en.daily.tryIt} Open a workspace and invite a teammate.`)
    await expect(cards.nth(1)).toContainText(en.card.moreSources.match(/=0 \{([^}]*)\}/)![1])
    await expect(page.getByText(en.daily.noEarlier)).toBeVisible()

    await filter.getByRole('link', { name: en.categories.open, exact: true }).click()
    await expect(page).toHaveURL(/\/en\/daily\/category\/open$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${en.categories.open}`)
    await expect(cards.getByRole('link')).toHaveText([titles.weights])
    await filter.getByRole('link', { name: en.daily.allCategories, exact: true }).click()
    await expect(page).toHaveURL(/\/en\/daily$/)
  })

  test("a category's banner keeps its text to the left of the art on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/zh-hans/daily/category/llm')
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toHaveText('#大模型')
    const banner = page.getByRole('region', { name: '大模型' })
    // 200 high at least, the text 210 wide at most, so the art's last 150 px stay in view.
    expect((await banner.boundingBox())!.height).toBeGreaterThanOrEqual(200)
    expect((await title.boundingBox())!.width).toBeLessThanOrEqual(210)
  })

  // Every category has sample stories, so an empty one is left to tests/unit/daily/public.test.tsx.

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
    await page.getByRole('region', { name: en.daily.tags }).getByRole('link', { name: en.tags.assistants }).click()
    await expect(page).toHaveURL(/\/en\/daily\/tag\/assistants$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${en.tags.assistants} · Daily`)
    // Listed by day and again in the hot list beside it.
    await expect(page.getByRole('link', { name: titles.workspaces }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: titles.preview })).toBeVisible()
    // Prism's story has other tags and isn't hot enough for the hot list.
    await expect(page.getByRole('link', { name: titles.prism })).toHaveCount(0)
  })

  test('another category keeps the page and puts a skeleton, then a retry, where the stories were', async ({ page }) => {
    await page.clock.install()
    await page.goto('/en/daily', { waitUntil: 'networkidle' })
    const main = page.getByRole('main')

    // Hold the next view of the list back, as a slow connection would.
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/en/daily/category/research' && url.searchParams.has('_rsc'),
      async (route) => {
        await held
        await route.continue()
      },
    )

    const categories = main.getByRole('navigation', { name: en.daily.filterLabel })
    await categories.getByRole('link', { name: en.categories.research }).click()
    const skeleton = main.getByRole('status', { name: en.states.loadingList })
    await expect(skeleton).toBeVisible()
    await expect(categories).toBeVisible()

    await page.clock.fastForward(10_000)
    await expect(main.getByRole('alert')).toContainText(en.states.failedTitle)
    await main.getByRole('button', { name: en.states.retry }).click()
    await expect(skeleton).toBeVisible()

    release()
    await expect(page).toHaveURL(/\/en\/daily\/category\/research$/)
    await expect(main.getByRole('link', { name: titles.benchmark }).first()).toBeVisible()
    await expect(skeleton).toHaveCount(0)
  })

  test("a story's page shows its skeleton while it comes in over a slow connection", async ({ page, context }) => {
    // As when the reader clicks before the list has prefetched the story.
    await page.route(/\/en\/daily\/sample-[^/?]+\?_rsc=/, (route) => (route.request().headers()['next-router-prefetch'] ? route.abort() : route.fallback()))
    await page.goto('/en/daily', { waitUntil: 'networkidle' })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 12 * 1024, uploadThroughput: 12 * 1024 })

    await page.getByRole('main').getByRole('link', { name: titles.preview }).first().click()
    const skeleton = page.getByRole('status', { name: en.states.loadingPage })
    await expect(skeleton).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: titles.preview })).toBeVisible({ timeout: 20_000 })
    await expect(skeleton).toHaveCount(0)
  })

  test('the stories the list shows are prefetched, so they open without waiting on the server', async ({ page }) => {
    // Tall enough to show a story that was not rendered at build time (only the newest one is).
    await page.setViewportSize({ width: 1280, height: 1600 })
    await page.goto('/en/daily', { waitUntil: 'networkidle' })
    const fetched: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('_rsc=') && !request.headers()['next-router-prefetch']) fetched.push(new URL(request.url()).pathname)
    })
    await page.getByRole('main').getByRole('article').getByRole('link', { name: titles.weights }).click()
    await expect(page.getByRole('heading', { level: 1, name: titles.weights })).toBeVisible()
    expect(fetched).toEqual([])
  })

  test("a product's topic page lists the stories about it, with its maker and app", async ({ page }) => {
    await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    await page.getByRole('region', { name: en.daily.entities }).getByRole('link', { name: /^Lumen Chat/ }).click()
    await expect(page).toHaveURL(/\/en\/daily\/topic\/lumenchat$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('#Lumen Chat')
    const main = page.getByRole('main')
    await expect(main.getByText('2 stories')).toBeVisible()
    await expect(main.getByRole('article').getByRole('link')).toHaveText([titles.workspaces, titles.preview])
    await expect(main.getByText(en.daily.noEarlier)).toBeVisible()
    await expect(main.getByRole('link', { name: /^App page/ })).toHaveAttribute('href', '/en/apps/lumen-chat')
    // The app's developer has a topic page of its own: a company.
    await main.getByRole('link', { name: 'Lumen Labs' }).click()
    await expect(page).toHaveURL(/\/en\/daily\/topic\/lumenlabs$/)
    await expect(page.getByRole('main').getByText(en.daily.entityKinds.company, { exact: true })).toBeVisible()
  })

  test("a story's page lists the stories of other events that read like it, each event once", async ({ page }) => {
    // Its report reads like Kitecode's and Orbit Notes', the closer first.
    await page.goto('/en/daily/sample-nimbus-3-reasons-step-by-step')
    const similar = page.getByRole('region', { name: en.daily.similar })
    await expect(similar.getByRole('link')).toHaveText([new RegExp(titles.weights), new RegExp(titles.benchmark)])

    // Both Lumen Chat stories read like Quill's, but they are one event: listed once, by the closer story.
    await page.goto('/en/daily/sample-quill-raises-funding-for-team-writing')
    await expect(similar.getByRole('link')).toHaveText([new RegExp(titles.workspaces)])

    // The other Lumen Chat story is of the same event, so only Quill's is listed.
    await page.goto('/en/daily/sample-lumen-chat-adds-shared-workspaces')
    await expect(similar.getByRole('link')).toHaveText([new RegExp(titles.quill)])

    // Nothing reads like it: no such block.
    await page.goto('/en/daily/sample-prism-turns-sketches-into-video')
    await expect(page.getByRole('heading', { level: 1, name: titles.prism })).toBeVisible()
    await expect(similar).toHaveCount(0)
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
