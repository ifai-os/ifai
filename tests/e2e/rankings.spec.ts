import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import type enMessages from '../../messages/en.json'
import { toHant } from '../../src/lib/i18n/hant'

import { createMember } from './member'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')
const ja = load('ja')
const zhHant = load('zh-hant')

/** The rankings open in the third phase. CI's main job builds the first and checks they stay hidden; its rankings job builds the third. */
const launched = process.env.NEXT_PUBLIC_SITE_PHASE === '3'

/** A vote sooner than this after the question appeared is kept but not counted (MIN_READ_MS in src/modules/rankings/rules.ts). */
const MIN_READ_MS = 4000

/** The sample contestants of scripts/seed-rankings.ts. */
const sampleModels = /Lumen 4|Atlas Pro 2|Kestrel 3|Orchid Large|Basalt 70B|Tundra 1\.5|Fjord Nano/

/** Opens a page that asks for a question as it loads, and returns the question the API handed out. */
async function openVote(page: Page, path: string): Promise<{ id: string | null }> {
  const battle = page.waitForResponse((response) => response.url().endsWith('/api/rankings/battles') && response.request().method() === 'POST')
  await page.goto(path)
  return ((await (await battle).json()) as { battle: { id: string | null } }).battle
}

test.describe('before the third phase', () => {
  test.skip(launched, 'This build is for the third phase.')

  test('the rankings are not on the site yet', async ({ page, request }) => {
    expect((await page.goto('/en/rankings'))?.status()).toBe(404)
    expect((await page.goto('/en/rankings/vote'))?.status()).toBe(404)
    expect((await request.post('/api/rankings/battles', { data: { locale: 'en' } })).status()).toBe(404)
    expect((await request.post('/api/rankings/battles/AAAAAAAAAAAAAAAAAAAAAAAA/vote', { data: { outcome: 'a', locale: 'en' } })).status()).toBe(404)
    await page.goto('/en')
    const nav = page.getByRole('navigation', { name: en.nav.label })
    await expect(nav.getByRole('link', { name: en.nav.daily })).toBeVisible()
    await expect(nav.getByRole('link', { name: en.nav.rankings })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: en.home.modelTop })).toHaveCount(0)
  })
})

test.describe('in the third phase', () => {
  test.skip(!launched, 'Build with NEXT_PUBLIC_SITE_PHASE=3.')

  test('the vote API answers only well-formed requests from this site', async ({ request }) => {
    const battles = '/api/rankings/battles'
    expect((await request.post(battles, { data: { locale: 'xx' } })).status()).toBe(400)
    expect((await request.post(battles, { data: { arena: 'Not a slug', locale: 'en' } })).status()).toBe(400)
    expect((await request.post(battles, { data: { arena: 'no-such-arena', locale: 'en' } })).status()).toBe(404)
    expect((await request.post(battles, { data: { locale: 'en' }, headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403)

    const vote = `${battles}/AAAAAAAAAAAAAAAAAAAAAAAA/vote`
    expect((await request.post(vote, { data: { outcome: 'maybe', locale: 'en' } })).status()).toBe(400)
    expect((await request.post(vote, { data: { outcome: 'a', locale: 'en' } })).status()).toBe(401)
    const fromElsewhere = await request.post(vote, { data: { outcome: 'a', locale: 'en' }, headers: { 'sec-fetch-site': 'cross-site' } })
    expect(fromElsewhere.status()).toBe(403)
    expect(fromElsewhere.headers()['cache-control']).toBe('private, no-store')
  })

  test('the navigation links to the rankings', async ({ page }) => {
    await page.goto('/en')
    await page.getByRole('navigation', { name: en.nav.label }).getByRole('link', { name: en.nav.rankings }).click()
    await expect(page).toHaveURL(/\/en\/rankings$/)
    await expect(page.getByRole('heading', { level: 1, name: en.rankings.headline })).toBeVisible()
  })
})

// Needs the sample rankings from scripts/seed-rankings.ts in a third-phase build: CI's rankings job has both.
test.describe('with the sample rankings', () => {
  test.skip(
    !launched || !process.env.E2E_SAMPLE_RANKINGS,
    'Build with NEXT_PUBLIC_SITE_PHASE=3, run `pnpm payload run scripts/seed-rankings.ts` and set E2E_SAMPLE_RANKINGS=1.',
  )

  test('the rankings page shows the latest weekly snapshot', async ({ page }) => {
    const response = await page.goto('/en/rankings')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: en.rankings.headline })).toBeVisible()
    await expect(page.getByRole('region', { name: en.rankings.newcomers })).toContainText('Kestrel 3 Coder')

    const top = page.getByRole('region', { name: en.rankings.topTen.replace('{arena}', 'Text') })
    await expect(top.getByRole('listitem')).toHaveCount(8)
    await expect(top.getByRole('listitem').first()).toContainText(sampleModels)
    await expect(top).not.toContainText('Fjord Nano')

    const rows = page.getByRole('table').locator('tbody tr')
    await expect(rows).toHaveCount(9)
    await expect(rows.filter({ hasText: 'Fjord Nano' })).toContainText(en.rankings.provisional)
    await expect(rows.filter({ hasText: 'Kestrel 3 Coder' })).toContainText('Apache-2.0')

    await expect(page.getByRole('heading', { name: en.rankings.value })).toBeVisible()
    await expect(page.getByRole('heading', { name: en.rankings.trend.replace('{weeks}', '12') })).toBeVisible()
    await expect(page.getByText(/^The gap between the best closed and the best open-weights model (went from -?\d+ to -?\d+|stayed at -?\d+) points\.$/)).toBeVisible()
    await expect(page.getByRole('heading', { name: en.rankings.makers })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/rankings$/)
  })

  test('the home page shows the top five of the first arena', async ({ page }) => {
    await page.goto('/en')
    const card = page.getByRole('region', { name: en.home.modelTop })
    const places = card.getByRole('listitem')
    await expect(places).toHaveCount(5)
    await expect(places.first()).toContainText(sampleModels)
    await expect(places.first()).toContainText(/^1/)
    await expect(card).not.toContainText('Fjord Nano')
    await card.getByRole('link', { name: en.home.viewAll }).click()
    await expect(page).toHaveURL(/\/en\/rankings$/)
  })

  test('filters keep only the matching models and are not indexed', async ({ page }) => {
    await page.goto('/en/rankings')
    await page.getByRole('navigation', { name: en.rankings.licenseFilter }).getByRole('link', { name: en.rankings.weights.open }).click()
    await expect(page).toHaveURL(/\/en\/rankings\?weights=open$/)
    const rows = page.getByRole('table').locator('tbody tr')
    await expect(rows).toHaveCount(4)
    for (const row of await rows.all()) await expect(row).toContainText(en.rankings.weights.open)

    await page.getByRole('navigation', { name: en.rankings.regionFilter }).getByRole('link', { name: en.rankings.regions.cn }).click()
    await expect(page).toHaveURL(/\/en\/rankings\?weights=open&region=cn$/)
    await expect(rows).toHaveCount(3)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

    await page.goto('/en/rankings?weights=closed&region=cn')
    await expect(page.getByText(en.rankings.noMatches)).toBeVisible()
    await page.getByRole('link', { name: en.rankings.clearFilters }).click()
    await expect(page).toHaveURL(/\/en\/rankings$/)
    await expect(rows).toHaveCount(9)
  })

  test('each arena has its own address; the first one lives at /rankings', async ({ page }) => {
    await page.goto('/en/rankings')
    const arenas = page.getByRole('navigation', { name: en.rankings.arenasLabel })
    await expect(arenas.getByRole('link', { name: 'Text' })).toHaveAttribute('aria-current', 'page')
    await arenas.getByRole('link', { name: 'Coding' }).click()
    await expect(page).toHaveURL(/\/en\/rankings\/coding$/)
    await expect(page.getByRole('region', { name: en.rankings.topTen.replace('{arena}', 'Coding') })).toBeVisible()
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(6)

    await arenas.getByRole('link', { name: 'Image generation' }).click()
    await expect(page).toHaveURL(/\/en\/rankings\/image$/)
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(4)

    await page.goto('/en/rankings/text?weights=open')
    await expect(page).toHaveURL(/\/en\/rankings\?weights=open$/)
    expect((await page.goto('/en/rankings/no-such-arena'))?.status()).toBe(404)
  })

  test('Traditional Chinese pages convert maker names and Simplified questions', async ({ page }) => {
    await page.goto('/zh-hant/rankings')
    await expect(page.getByRole('table')).toContainText(toHant('红隼智能'))

    await openVote(page, '/zh-hant/rankings/vote')
    const question = page.getByRole('region', { name: zhHant.rankingsVote.question }).locator('p[lang]')
    await expect(question).toHaveAttribute('lang', 'zh-Hant')
    const converted = ['帮我写一段给新同事的欢迎词，语气轻松，不超过 100 字。', '用通俗的话解释什么是复利，并举一个例子。'].map(toHant)
    expect(converted).toContain(await question.textContent())
  })

  test('a page language without questions gets English ones', async ({ page }) => {
    await openVote(page, '/ja/rankings/vote?arena=coding')
    await expect(page.getByRole('region', { name: ja.rankingsVote.question }).locator('p[lang]')).toHaveAttribute('lang', 'en')
  })

  test('the image arena shows two pictures to vote on, and only the files are public', async ({ page, request }) => {
    await openVote(page, '/en/rankings/vote?arena=image')
    await expect(page.getByText(en.rankingsVote.introImage)).toBeVisible()
    await expect(page.getByRole('region', { name: en.rankingsVote.description })).toBeVisible()
    for (const alt of [en.rankingsVote.imageA, en.rankingsVote.imageB]) {
      const picture = page.getByRole('img', { name: alt })
      await expect(picture).toBeVisible()
      await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
      const box = await picture.boundingBox()
      expect(box?.height).toBeLessThanOrEqual(601)

      // The full picture opens in a new tab; its name says nothing about the model.
      const link = page.getByRole('link', { name: `${alt} ${en.rankingsVote.newTab}` })
      await expect(link).toHaveAttribute('target', '_blank')
      const href = (await link.getAttribute('href')) ?? ''
      expect(href).toMatch(/^\/api\/arena-images\/file\/[0-9a-f]{24}\.png(\?prefix=arena)?$/)
      const file = await request.get(href)
      expect(file.status()).toBe(200)
      expect(file.headers()['content-type']).toBe('image/png')
    }
    // Which pictures exist, and when each was made, stays in the back office.
    expect((await request.get('/api/arena-images')).status()).toBe(403)
  })

  test('a visitor reads the answers and is asked to sign in to vote', async ({ page }) => {
    const battle = await openVote(page, '/en/rankings/vote')
    expect(battle.id).toBeNull()
    await expect(page.getByRole('heading', { level: 1, name: en.rankingsVote.title })).toBeVisible()
    await expect(page.getByRole('heading', { name: en.rankingsVote.modelA })).toBeVisible()
    await expect(page.getByRole('heading', { name: en.rankingsVote.modelB })).toBeVisible()

    await page.getByRole('group', { name: en.rankingsVote.choices }).getByRole('button', { name: en.rankingsVote.outcomes.a }).click()
    const dialog = page.getByRole('dialog', { name: en.rankingsVote.signInTitle })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a member votes, sees which models answered, and a quick vote does not count', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      const choices = page.getByRole('group', { name: en.rankingsVote.choices })

      // Straight away: shown, kept, not counted.
      const first = await openVote(page, '/en/rankings/vote')
      expect(first.id).toMatch(/^[A-Za-z0-9_-]{24}$/)
      await choices.getByRole('button', { name: en.rankingsVote.outcomes.tie }).click()
      await expect(page.getByRole('status').filter({ hasText: en.rankingsVote.notCounted })).toBeVisible()
      await expect(page.getByRole('region', { name: en.rankingsVote.modelA }).first()).toContainText(sampleModels)
      await expect(page.getByRole('region', { name: en.rankingsVote.modelB }).first()).toContainText(sampleModels)

      // The same question cannot take a second vote.
      const again = await page.request.post(`/api/rankings/battles/${first.id}/vote`, { data: { outcome: 'a', locale: 'en' } })
      expect(again.status()).toBe(409)

      // After reading: counted.
      const next = page.waitForResponse((response) => response.url().endsWith('/api/rankings/battles'))
      await page.getByRole('button', { name: en.rankingsVote.next }).click()
      await next
      await page.waitForTimeout(MIN_READ_MS + 500)
      await choices.getByRole('button', { name: en.rankingsVote.outcomes.a }).click()
      await expect(page.getByRole('status').filter({ hasText: en.rankingsVote.counted })).toBeVisible()
      await expect(page.getByRole('region', { name: en.rankingsVote.modelA }).first()).toContainText(en.rankingsVote.yourPick)

      const { rows } = await member.query<{ outcome: string; counted: boolean }>(
        'select outcome, counted from arena_battles where user_id = $1 and voted_at is not null order by voted_at',
        [member.id],
      )
      expect(rows).toEqual([
        { outcome: 'tie', counted: false },
        { outcome: 'a', counted: true },
      ])

      // 「下载我的数据」 has both votes, newest first; a question not voted on yet stays out, so it can't give its models away.
      const third = page.waitForResponse((response) => response.url().endsWith('/api/rankings/battles'))
      await page.getByRole('button', { name: en.rankingsVote.next }).click()
      await third
      const exported = await (await page.request.get('/api/account/export?locale=en')).json()
      expect(exported.arenaVotes).toMatchObject([
        { vote: 'a', counted: true, pageLanguage: 'en', arena: { name: 'Text', url: expect.stringMatching(/\/en\/rankings\/text$/) } },
        { vote: 'tie', counted: false, pageLanguage: 'en', arena: { name: 'Text' } },
      ])
      for (const vote of exported.arenaVotes) {
        expect(vote.question.name).toBeTruthy()
        expect(vote.modelA.name).toMatch(sampleModels)
        expect(vote.modelB.name).toMatch(sampleModels)
      }
      // The settings page says the download has the votes, and that they stay when the account goes.
      const settings = await context.newPage()
      await settings.goto('/en/me/account?section=data')
      await expect(settings.getByText(en.account.exportRankings)).toBeVisible()
      await expect(settings.getByText(en.account.deleteRankings)).toBeVisible()
      await settings.close()
    } finally {
      await member.query('delete from arena_battles where user_id = $1', [member.id])
      await member.remove()
    }
  })

  test('a member who used the day’s votes is told to come back tomorrow', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs a member in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000')
    try {
      await context.addCookies([member.cookie])
      // 200 counted votes in the last minute (DAILY_VOTES), written as the vote API writes them.
      await member.query(
        `insert into arena_battles (id, arena_id, prompt_id, model_a_id, model_b_id, answer_a_id, answer_b_id, user_id, page_locale, created_at, voted_at, outcome, counted)
         select 'e2e-' || md5($1::text || n::text), 0, 0, 0, 0, 0, 0, $1, 'en', now() - interval '1 minute', now(), 'tie', true from generate_series(1, 200) as n`,
        [member.id],
      )
      await page.goto('/en/rankings/vote')
      await expect(page.getByText(en.rankingsVote.limitTitle)).toBeVisible()
      await expect(page.getByRole('link', { name: en.rankingsVote.seeRankings })).toHaveAttribute('href', '/en/rankings')
      expect((await page.request.post('/api/rankings/battles', { data: { locale: 'en' } })).status()).toBe(429)
    } finally {
      await member.query('delete from arena_battles where user_id = $1', [member.id])
      await member.remove()
    }
  })
})
