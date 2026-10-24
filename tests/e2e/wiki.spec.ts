import { readFileSync } from 'node:fs'

import { expect, test, type Locator } from '@playwright/test'

import type enMessages from '../../messages/en.json'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')
const zhHans = load('zh-hans')

test('the Wiki is everywhere from the third phase and nowhere before it', async ({ page, request }) => {
  const launched = (await request.get('/en/wiki')).status() === 200
  for (const path of ['/en/wiki', '/en/wiki/entries', '/ja/wiki/topics/sample-agents', '/ko/wiki/sample-agent']) {
    if (!launched) expect((await request.get(path)).status(), path).toBe(404)
  }
  const index = await (await request.get('/sitemap.xml')).text()
  expect(index.includes('/sitemaps/wiki-1.xml</loc>')).toBe(launched)
  expect((await request.get('/sitemaps/wiki-1.xml')).status()).toBe(launched ? 200 : 404)

  await page.goto('/en')
  const wiki = page.getByRole('navigation', { name: en.nav.label }).getByRole('link', { name: en.nav.wiki })
  if (launched) await expect(wiki).toBeVisible()
  else await expect(wiki).toHaveCount(0)
})

// Needs a build with NEXT_PUBLIC_SITE_PHASE=3 and the samples from scripts/seed-wiki.ts, as CI does.
test.describe('with the sample Wiki', () => {
  test.skip(!process.env.E2E_SAMPLE_WIKI, 'Build with NEXT_PUBLIC_SITE_PHASE=3, run scripts/seed-wiki.ts and set E2E_SAMPLE_WIKI.')

  test('the home shows the real counts, today’s entry, the topics and the newest entries', async ({ page }) => {
    const response = await page.goto('/en/wiki')
    expect(response?.status()).toBe(200)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: en.wiki.welcome })).toBeVisible()
    await expect(main.getByText('10 entries', { exact: true })).toBeVisible()
    await expect(main.getByText('6 topics', { exact: true })).toBeVisible()
    await expect(main.getByRole('link', { name: new RegExp(`^${en.wiki.today}`) })).toHaveAttribute('href', /^\/en\/wiki\/sample-(agent|large-language-model)$/)
    await expect(main.getByRole('region', { name: en.wiki.topicsTitle }).getByRole('listitem')).toHaveCount(6)
    await expect(main.getByRole('region', { name: en.wiki.newest }).getByRole('link', { name: 'Prompt injection' })).toBeVisible()
    await expect(main.getByRole('region', { name: en.wiki.didYouKnow })).toBeVisible()
    // The sample draft never shows.
    await expect(main.getByText('Fine-tuning')).toHaveCount(0)
  })

  test('a topic leads to its entries in one click, in the editor’s reading order', async ({ page }) => {
    // Cards and rows open on a tap anywhere, not only on their name: tap at the right edge, halfway down.
    const tapOffName = async (item: Locator) => {
      const box = await item.boundingBox()
      if (!box) throw new Error('Not on the page')
      await item.click({ position: { x: box.width - 12, y: box.height / 2 } })
    }

    await page.goto('/en/wiki')
    await tapOffName(page.getByRole('region', { name: en.wiki.topicsTitle }).getByRole('listitem').filter({ hasText: 'Agents and execution' }))
    await expect(page).toHaveURL(/\/en\/wiki\/topics\/sample-agents$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Agents and execution' })).toBeVisible()
    const mustRead = page.getByRole('region', { name: en.wiki.mustRead })
    await expect(mustRead.getByRole('listitem')).toHaveCount(3)
    await expect(mustRead.getByRole('listitem').first()).toContainText('Agent')
    await tapOffName(mustRead.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Harness', exact: true }) }))
    await expect(page).toHaveURL(/\/en\/wiki\/sample-harness$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Harness' })).toBeVisible()
    // Back to the topic from the breadcrumb.
    await page.getByRole('navigation', { name: en.wiki.breadcrumb }).getByRole('link', { name: 'Agents and execution' }).click()
    await expect(page).toHaveURL(/\/en\/wiki\/topics\/sample-agents$/)
  })

  test('an entry has its names, its sections, both sides of its relations, its sources and when it was checked', async ({ page }) => {
    const response = await page.goto('/en/wiki/sample-agent')
    expect(response?.status()).toBe(200)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: 'Agent' })).toBeVisible()
    await expect(main.getByText('Also called: AI agent')).toBeVisible()
    await expect(main.getByRole('region', { name: en.wiki.definition })).toContainText('works toward a goal on its own')
    for (const section of ['explanation', 'examples', 'uses', 'limitations', 'contexts', 'comparisons', 'relations', 'sources'] as const) {
      await expect(main.getByRole('heading', { level: 2, name: en.wiki.sections[section] }), section).toBeVisible()
    }
    // Steps are for methods only.
    await expect(main.getByRole('heading', { level: 2, name: en.wiki.sections.steps })).toHaveCount(0)

    // Filled on this entry (the model) and on the other one (Harness): both show here.
    const confused = main.getByRole('region', { name: en.wiki.sections.comparisons })
    await expect(confused.getByRole('link', { name: 'Large language model' })).toBeVisible()
    await expect(confused.getByRole('link', { name: 'Harness' })).toBeVisible()
    // Each other entry once: the model is a prerequisite too, but already shows above.
    const related = main.getByRole('region', { name: en.wiki.sections.relations })
    await expect(related.getByRole('link', { name: /^Tool use/ })).toBeVisible()
    await expect(related.getByRole('link', { name: /^Prompt injection/ })).toBeVisible()
    await expect(related.getByRole('link', { name: /^Large language model/ })).toHaveCount(0)

    const sources = main.getByRole('region', { name: en.wiki.sections.sources })
    await expect(sources.getByRole('link', { name: 'Building effective agents' })).toHaveAttribute('rel', 'nofollow noopener')
    await expect(main.getByText('Facts checked Oct 22, 2026').first()).toBeVisible()
    expect(await page.locator('script[type="application/ld+json"]').first().textContent()).toContain('"@type":"DefinedTerm"')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/wiki\/sample-agent$/)
  })

  test('the samples’ apps and Skills show under「Try it」when they are there', async ({ page }) => {
    test.skip(!process.env.E2E_SAMPLE_APPS || !process.env.E2E_SAMPLE_SKILLS, 'Run seed-apps.ts and seed-skills.ts before seed-wiki.ts.')
    await page.goto('/en/wiki/sample-agent')
    const further = page.getByRole('region', { name: en.wiki.sections.further })
    await expect(further.getByRole('link', { name: /^Kitecode/ })).toHaveAttribute('href', '/en/apps/kitecode')
    await expect(further.getByRole('link', { name: /^Release Notes Writer/ })).toHaveAttribute('href', '/en/resources/skills/sample-release-notes')
  })

  test('every language shows its own text, and English where a language has none yet', async ({ page }) => {
    await page.goto('/zh-hans/wiki/sample-agent')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: '智能体' })).toHaveAttribute('lang', 'zh-Hans')
    await expect(main.getByText('又称：Agent、AI Agent、AI 智能体、代理')).toBeVisible()
    await expect(main.getByRole('heading', { level: 2, name: zhHans.wiki.sections.explanation })).toBeVisible()

    // Converted from Simplified by OpenCC with Taiwan phrases: 智能 → 智慧.
    await page.goto('/zh-hant/wiki/sample-agent')
    await expect(page.getByRole('heading', { level: 1, name: '智慧體' })).toHaveAttribute('lang', 'zh-Hant')

    await page.goto('/ja/wiki/sample-agent')
    await expect(page.getByRole('heading', { level: 1, name: 'エージェント' })).toHaveAttribute('lang', 'ja')

    // No Korean text yet: the English entry, marked as English, in a Korean page.
    await page.goto('/ko/wiki/sample-agent')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(page.getByRole('heading', { level: 1, name: 'Agent' })).toHaveAttribute('lang', 'en')
  })

  test('the site search finds entries by any of their names, in every language', async ({ page }) => {
    for (const q of ['智能体', 'AI agent', 'エージェント']) {
      await page.goto(`/en/search?q=${encodeURIComponent(q)}`)
      await expect(page.getByRole('main').getByRole('link', { name: /^Agent/ }).first(), q).toContainText(en.search.kind.wiki)
    }
    await page.goto('/zh-hans/search?q=RAG&type=wiki')
    await expect(page.getByRole('main').getByRole('link', { name: /^检索增强生成/ })).toBeVisible()
    await page.goto('/en/search?q=Fine-tuning&type=wiki')
    await expect(page.getByText(en.search.noMatchTitle.replace('{q}', 'Fine-tuning'))).toBeVisible()
  })

  test('the Wiki home searches the Wiki only', async ({ page }) => {
    await page.goto('/en/wiki')
    const box = page.getByRole('main').getByRole('searchbox', { name: en.wiki.searchLabel })
    await box.fill('context window')
    await box.press('Enter')
    await expect(page).toHaveURL(/\/en\/search\?q=context\+window&type=wiki$/)
    await expect(page.getByRole('main').getByRole('link', { name: /^Context window/ })).toBeVisible()
  })

  test('all entries go by name, one type at a time if asked', async ({ page }) => {
    await page.goto('/en/wiki/entries')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: en.wiki.entriesTitle })).toBeVisible()
    // Entry links only (topic links go to /wiki/topics/…).
    await expect(main.locator('a[href^="/en/wiki/sample-"]')).toHaveText([
      'Agent',
      'Context window',
      'Hallucination',
      'Harness',
      'Large language model',
      'Prompt',
      'Prompt injection',
      'Retrieval-augmented generation',
      'Token',
      'Tool use',
    ])

    await main.getByRole('navigation', { name: en.wiki.typeFilter }).getByRole('link', { name: en.wiki.typesPlural.method }).click()
    await expect(page).toHaveURL(/\/en\/wiki\/entries\?type=method$/)
    await expect(main.getByRole('link', { name: 'Retrieval-augmented generation' })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Agent', exact: true })).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('drafts, unknown entries and pages answer 404', async ({ page }) => {
    for (const path of ['/en/wiki/sample-fine-tuning', '/en/wiki/not-an-entry', '/en/wiki/topics', '/en/wiki/topics/not-a-topic', '/en/wiki/entries?page=2', '/en/wiki/entries?page=0']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })

  test('the sitemap lists the Wiki pages and published entries only', async ({ request }) => {
    const wiki = await (await request.get('/sitemaps/wiki-1.xml')).text()
    expect(wiki).toContain('/ja/wiki/sample-agent</loc>')
    expect(wiki).not.toContain('sample-fine-tuning')
    const pages = await (await request.get('/sitemaps/pages-1.xml')).text()
    expect(pages).toContain('/en/wiki</loc>')
    expect(pages).toContain('/zh-hans/wiki/topics/sample-agents</loc>')
  })
})
