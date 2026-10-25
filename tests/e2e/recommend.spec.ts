import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const r = en.recommend

/** The recommend module opens in phase two (NEXT_PUBLIC_SITE_PHASE ≥ 2, as CI builds). */
const launched = Number(process.env.NEXT_PUBLIC_SITE_PHASE ?? '1') >= 2

/** The sample articles of scripts/seed-articles.ts. */
const samples = {
  lead: '示例：把公司知识库接进 Agent，三个月踩过的 5 个坑',
  english: 'Sample: an AGENTS.md template that keeps AI code in house style',
  latestOnly: 'サンプル：プロンプトは短いほど安定する',
  draft: '示例：还没写完的草稿',
  hidden: '示例：已隐藏的文章',
}

test('the recommend pages and link come with phase two', async ({ page }) => {
  expect((await page.goto('/en/recommend'))?.status()).toBe(launched ? 200 : 404)
  await page.goto('/en')
  await expect(page.getByRole('navigation', { name: en.nav.label }).getByRole('link', { name: en.nav.recommend })).toHaveCount(launched ? 1 : 0)
})

test.describe('the recommend list', () => {
  test.skip(!launched, 'The recommend module opens in phase two: build with NEXT_PUBLIC_SITE_PHASE=2, as CI does.')

  test('answers 404 for addresses that cannot be right, and keeps filtered lists out of search engines', async ({ page }) => {
    for (const path of ['/en/recommend?channel=news', '/en/recommend?tab=hot', '/en/recommend?page=0', '/en/recommend?page=999', '/en/recommend/abc', '/en/recommend/2000000000']) {
      expect((await page.goto(path))?.status(), path).toBe(404)
    }
    await page.goto('/en/recommend')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await page.goto('/en/recommend?tab=latest')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })
})

test.describe('the sample articles', () => {
  test.skip(!launched || !process.env.E2E_SAMPLE_ARTICLES, 'Run `pnpm payload run scripts/seed-articles.ts` and set E2E_SAMPLE_ARTICLES=1.')

  test('picks lead the list; 最新 has every published article and nothing else', async ({ page }) => {
    await page.goto('/en/recommend')
    const picks = page.getByRole('region', { name: r.headlines })
    await expect(picks.getByRole('link', { name: new RegExp(samples.lead) })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: samples.latestOnly })).toHaveCount(0)

    await page.getByRole('navigation', { name: r.tabsLabel }).getByRole('link', { name: r.tabs.latest }).click()
    await expect(page).toHaveURL(/tab=latest/)
    await expect(page.getByRole('heading', { level: 3, name: samples.latestOnly })).toBeVisible()
    for (const title of [samples.draft, samples.hidden]) await expect(page.getByText(title)).toHaveCount(0)
  })

  test('a channel and a tag narrow the list', async ({ page }) => {
    await page.goto('/en/recommend?tab=latest&channel=coding')
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([samples.english])
    await page.goto('/en/recommend?tab=latest&tag=rag')
    await expect(page.getByRole('heading', { level: 2, name: '#rag' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(2)
  })

  test('an article shows its body, contents and related articles, in its own language', async ({ page }) => {
    await page.goto('/en/recommend?tab=latest')
    await page.getByRole('heading', { level: 3, name: samples.lead }).getByRole('link').click()
    await expect(page.getByRole('heading', { level: 1, name: samples.lead })).toHaveAttribute('lang', 'zh-Hans')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/zh-hans\/recommend\/\d+$/)
    await expect(page.getByText(r.pickReason)).toBeVisible()

    const toc = page.getByRole('navigation', { name: r.toc })
    await expect(toc.getByRole('link')).toHaveCount(3)
    await toc.getByRole('link', { name: '2. 权限必须跟着文档走' }).click()
    await expect(page).toHaveURL(/#s2$/)
    await expect(page.locator('#s2')).toBeInViewport()

    await expect(page.locator('pre code')).toContainText('splitByHeading')
    await expect(page.locator('main a[href="https://example.com/rag"]')).toHaveAttribute('target', '_blank')
    const related = page.getByRole('region', { name: r.related })
    await expect(related.getByRole('link')).toHaveCount(3)
    await expect(related.getByText(samples.lead)).toHaveCount(0)
  })

  test('drafts and hidden articles are not on the site', async ({ page, request }) => {
    const sitemap = await (await request.get('/sitemaps/pages-1.xml')).text()
    // Each article is listed once, at its address in its own language.
    const ids = [...sitemap.matchAll(/\/recommend\/(\d+)</g)].map((match) => Number(match[1]))
    expect(ids.length).toBeGreaterThanOrEqual(5)
    expect(new Set(ids).size).toBe(ids.length)
    // The sample draft and hidden article are the last two the seed writes; their numbers follow the five published ones.
    const highest = Math.max(...ids)
    for (const id of [highest + 1, highest + 2]) expect((await page.goto(`/en/recommend/${id}`))?.status()).toBe(404)
  })
})
