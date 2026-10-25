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

  // The sample heat (scripts/seed-apps.ts): Lumen Chat leads, Kitecode is rising, Orbit Notes is new this week.
  const names = /^(Kitecode|Lumen Chat|Orbit Notes)\b/

  test('lists published apps by heat and leaves drafts out', async ({ page }) => {
    await page.goto('/en/apps')
    const main = page.getByRole('main')
    await expect(main.getByText(/^3 apps listed · Heat updates once a day/)).toBeVisible()
    await expect(main.getByRole('table').getByRole('link', { name: names })).toHaveText([/Lumen Chat/, /Kitecode/, /Orbit Notes/])
    await expect(main.getByRole('list', { name: en.apps.podium }).getByRole('link')).toHaveText([
      /Lumen Chat/,
      /Kitecode/,
      /Orbit Notes/,
    ])
    await expect(main.getByText('Draft Demo')).toHaveCount(0)
    await expect(main.getByRole('region', { name: en.apps.newcomers }).getByRole('link')).toHaveText([/Orbit Notes/])
  })

  test('the rising and new boards take their own apps', async ({ page }) => {
    await page.goto('/en/apps')
    const boards = page.getByRole('navigation', { name: en.apps.boardsLabel })
    const table = page.getByRole('main').getByRole('table')

    await boards.getByRole('link', { name: en.apps.boards.rising }).click()
    await expect(page).toHaveURL(/\/en\/apps\?board=rising$/)
    await expect(boards.getByRole('link', { name: en.apps.boards.rising })).toHaveAttribute('aria-current', 'page')
    await expect(table.getByRole('link', { name: names })).toHaveText([/Kitecode/])
    await expect(page.getByRole('list', { name: en.apps.podium })).toHaveCount(0)

    await boards.getByRole('link', { name: en.apps.boards.new }).click()
    await expect(page).toHaveURL(/\/en\/apps\?board=new$/)
    await expect(table.getByRole('link', { name: names })).toHaveText([/Orbit Notes/, /Kitecode/])
    await expect(table.getByRole('link', { name: /^Orbit Notes/ })).toContainText('Added 3 days ago')
  })

  test('another board keeps the page and puts a skeleton, then a retry, where the results were', async ({ page }) => {
    await page.clock.install()
    await page.goto('/en/apps', { waitUntil: 'networkidle' })
    const main = page.getByRole('main')

    // Hold the next view of the list back, as a slow connection would.
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/en/apps' && url.searchParams.get('board') === 'rising' && url.searchParams.has('_rsc'),
      async (route) => {
        await held
        await route.continue()
      },
    )

    await main.getByRole('navigation', { name: en.apps.boardsLabel }).first().getByRole('link', { name: en.apps.boards.rising }).click()
    const skeleton = main.getByRole('status', { name: en.states.loadingList })
    await expect(skeleton).toBeVisible()
    await expect(main.getByRole('table')).toHaveCount(0)
    await expect(main.getByRole('search')).toBeVisible()

    await page.clock.fastForward(10_000)
    await expect(main.getByRole('alert')).toContainText(en.states.failedTitle)
    await main.getByRole('button', { name: en.states.retry }).click()
    await expect(skeleton).toBeVisible()

    release()
    await expect(page).toHaveURL(/\/en\/apps\?board=rising$/)
    await expect(main.getByRole('table').getByRole('link', { name: names })).toHaveText([/Kitecode/])
    await expect(skeleton).toHaveCount(0)
  })

  test("an app's page shows its skeleton while it comes in over a slow connection", async ({ page, context }) => {
    await page.goto('/en/apps', { waitUntil: 'networkidle' })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 12 * 1024, uploadThroughput: 12 * 1024 })

    await page.getByRole('main').getByRole('table').getByRole('link', { name: appLink('Kitecode') }).click()
    const skeleton = page.getByRole('status', { name: en.states.loadingPage })
    await expect(skeleton).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Kitecode' })).toBeVisible({ timeout: 20_000 })
    await expect(skeleton).toHaveCount(0)
  })

  test('column headings sort the list through the address', async ({ page }) => {
    await page.goto('/en/apps')
    const table = page.getByRole('main').getByRole('table')
    await expect(table.getByRole('columnheader', { name: en.apps.columns.heat })).toHaveAttribute('aria-sort', 'descending')

    await table.getByRole('link', { name: en.apps.columns.change }).click()
    await expect(page).toHaveURL(/\/en\/apps\?sort=change$/)
    await expect(table.getByRole('columnheader', { name: en.apps.columns.change })).toHaveAttribute('aria-sort', 'descending')
    await expect(table.getByRole('link', { name: names })).toHaveText([/Kitecode/, /Lumen Chat/, /Orbit Notes/])
    // Site rank is hidden until APPS_SHOW_TRANCO_RANK is on.
    await expect(table.getByRole('columnheader', { name: en.apps.columns.site })).toHaveCount(0)
  })

  test("an app's page shows its heat and its places on the lists", async ({ page }) => {
    await page.goto('/en/apps/lumen-chat')
    await page.getByRole('tab', { name: en.apps.heat }).click()
    const heat = page.getByRole('region', { name: en.apps.heat })
    await expect(heat.getByRole('img', { name: /^Heat over the last 30 days, from \d+ to 39$/ })).toBeVisible()
    await expect(heat.getByRole('table', { name: en.apps.heatTable }).getByRole('row')).toHaveCount(32)

    await heat.getByRole('button', { name: '7 days' }).click()
    await expect(heat.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    await expect(heat.getByRole('img', { name: 'Heat over the last 7 days, from 40 to 39' })).toBeVisible()

    for (const [part, weight] of [['rank', 50], ['engagement', 30], ['mentions', 20]] as const) {
      await expect(heat.getByText(`${en.apps.weights[part]} · weight ${weight}%`)).toBeVisible()
    }
    // Beside the tabs on wider screens, whichever tab is open.
    const places = page.getByRole('complementary', { name: en.apps.places })
    await expect(places.getByRole('link', { name: `${en.apps.placeTop} #1` })).toHaveAttribute('href', '/en/apps')
    await expect(places.getByRole('link', { name: `${en.apps.placeRising} ${en.apps.notOnList}` })).toHaveAttribute(
      'href',
      '/en/apps?board=rising',
    )
    await page.getByRole('tab', { name: en.reviews.title }).click()
    await expect(places).toBeVisible()
  })

  test('the home page shows the hottest apps and the top riser', async ({ page }) => {
    await page.goto('/en')
    const trending = page.getByRole('region', { name: en.home.trendingApps })
    await expect(trending.getByRole('link', { name: names })).toHaveText([/Lumen Chat/, /Kitecode/, /Orbit Notes/])
    await expect(trending.getByRole('link', { name: /^Lumen Chat/ })).toHaveAttribute('href', '/en/apps/lumen-chat')
    await expect(page.getByRole('link', { name: new RegExp(`^${en.home.pickApp} Kitecode`) })).toHaveAttribute(
      'href',
      '/en/apps/kitecode',
    )
  })

  test("an app's page lists the Daily stories about it", async ({ page }) => {
    test.skip(!process.env.E2E_SAMPLE_STORIES, 'Run scripts/seed-stories.ts before scripts/seed-apps.ts and set E2E_SAMPLE_STORIES=1.')
    await page.goto('/en/apps/lumen-chat')
    await page.getByRole('tab', { name: en.apps.heat }).click()
    const mentions = page.getByRole('region', { name: en.apps.mentionsTitle })
    await expect(mentions.getByRole('link', { name: /^Sample: Lumen Chat adds shared workspaces/ })).toHaveAttribute(
      'href',
      '/en/daily/sample-lumen-chat-adds-shared-workspaces',
    )
    await expect(mentions.getByRole('link', { name: /^Sample: Kitecode/ })).toHaveCount(0)
  })

  test('categories include apps listed there as a second category', async ({ page }) => {
    await page.goto('/en/apps/category/assistants')
    await expect(page.getByRole('heading', { level: 1, name: 'AI assistants' })).toBeVisible()
    const filter = page.getByRole('navigation', { name: en.apps.filterLabel })
    await expect(filter.getByRole('link', { name: /^AI assistants/ })).toHaveAttribute('aria-current', 'page')
    const table = page.getByRole('main').getByRole('table')
    for (const name of ['Kitecode', 'Lumen Chat', 'Orbit Notes']) {
      await expect(table.getByRole('link', { name: appLink(name) })).toBeVisible()
    }

    await filter.getByRole('link', { name: /^Coding/ }).click()
    await expect(page).toHaveURL(/\/en\/apps\/category\/coding$/)
    await expect(table.getByRole('link', { name: appLink('Kitecode') })).toBeVisible()
    await expect(table.getByRole('link', { name: appLink('Lumen Chat') })).toHaveCount(0)
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

    // No alternatives were picked, so the page shows the hottest others from the same category.
    await page.getByRole('tab', { name: en.apps.alternatives }).click()
    const alternatives = page.getByRole('region', { name: en.apps.alternatives })
    await expect(alternatives.getByRole('link')).toHaveText([/Kitecode/, /Orbit Notes/])
  })

  test("on wider screens an app's page is in tabs, the open one in the address", async ({ page }) => {
    await page.goto('/en/apps/lumen-chat')
    const tabs = page.getByRole('tablist', { name: en.apps.tabs.label })
    await expect(tabs.getByRole('tab')).toHaveText([en.apps.tabs.overview, en.apps.heat, en.reviews.title, en.apps.alternatives])
    await expect(tabs.getByRole('tab', { name: en.apps.tabs.overview })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel', { name: en.apps.tabs.overview })).toHaveCount(2)
    await expect(page.getByRole('heading', { level: 2, name: en.apps.faqs })).toBeVisible()
    await expect(page.getByRole('region', { name: en.apps.heat })).toBeHidden()

    await tabs.getByRole('tab', { name: en.apps.heat }).click()
    await expect(page).toHaveURL(/\/en\/apps\/lumen-chat#heat$/)
    await expect(page.getByRole('region', { name: en.apps.heat })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: en.apps.faqs })).toBeHidden()

    // Arrow keys move between the tabs; Home and End go to the first and the last.
    await page.keyboard.press('ArrowRight')
    await expect(tabs.getByRole('tab', { name: en.reviews.title })).toBeFocused()
    await expect(page).toHaveURL(/#reviews$/)
    await expect(page.getByRole('region', { name: en.reviews.title })).toBeVisible()
    await page.keyboard.press('End')
    await expect(page).toHaveURL(/#alternatives$/)
    await page.keyboard.press('Home')
    await expect(page).toHaveURL(/\/en\/apps\/lumen-chat$/)
    await expect(tabs.getByRole('tab', { name: en.apps.tabs.overview })).toBeFocused()

    // An address opens its tab, and so does one for a place inside a tab.
    await page.goto('/en/apps/lumen-chat#reviews')
    await expect(tabs.getByRole('tab', { name: en.reviews.title })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('region', { name: en.reviews.title })).toBeVisible()
    await page.goto('/en/apps/lumen-chat#faqs')
    await expect(tabs.getByRole('tab', { name: en.apps.tabs.overview })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { level: 2, name: en.apps.faqs })).toBeInViewport()
  })

  test("on phones an app's page is one long page, without tabs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/apps/lumen-chat')
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('tabpanel')).toHaveCount(0)
    // In the phone board's order: the FAQ comes after the heat.
    const order = [en.apps.about, en.apps.features, en.apps.heat, en.apps.faqs, en.reviews.title, en.apps.alternatives]
    let above = 0
    for (const name of order) {
      const heading = page.getByRole('heading', { level: 2, name, exact: true })
      await expect(heading).toBeVisible()
      const top = (await heading.boundingBox())?.y ?? 0
      expect(top, name).toBeGreaterThan(above)
      above = top
    }
    await expect(page.getByRole('heading', { level: 3, name: en.apps.places })).toBeVisible()
  })

  test('picked alternatives that are not published are left out', async ({ page }) => {
    await page.goto('/en/apps/kitecode')
    await page.getByRole('tab', { name: en.apps.alternatives }).click()
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
