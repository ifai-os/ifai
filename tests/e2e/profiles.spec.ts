import { readFileSync } from 'node:fs'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const p = en.profiles
const c = en.circles

/** Members' pages come with the circles (NEXT_PUBLIC_SITE_PHASE ≥ 2, as CI builds); the server says which phase it was built for. */
async function circlesLaunched(request: APIRequestContext): Promise<boolean> {
  return (await request.get('/api/circles/feed')).status() !== 404
}

test('members’ pages and following come with the circles', async ({ page, request }) => {
  const launched = await circlesLaunched(request)
  expect((await page.goto('/en/u/nobody-at-all'))?.status()).toBe(404)
  expect((await request.post('/api/follows/members', { data: { handle: 'nobody-at-all', on: true } })).status()).toBe(launched ? 401 : 404)
  expect((await request.patch('/api/account/profile', { data: { bio: 'Hi', locale: 'en' } })).status()).toBe(launched ? 401 : 404)
  expect((await request.get('/api/circles/people')).status()).toBe(launched ? 200 : 404)
})

test.describe('members’ pages', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await circlesLaunched(request)), 'Circles launch in phase two: build with NEXT_PUBLIC_SITE_PHASE=2, as CI does.')
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
  })

  test('a member’s page, following from it, the two lists and the 关注 feed', async ({ page, context, request, baseURL }) => {
    test.slow()
    const site = baseURL ?? 'http://localhost:3000'
    const member = await createMember(site, 'Ada Profiles')
    const other = await createMember(site, 'Grace Profiles')
    const bulk = `smoke-bulk-${member.id}`
    try {
      const aiArt = (await member.query<{ id: number }>(`select id from circles where slug = 'ai-art'`)).rows[0].id
      await other.query(`insert into member_profiles (user_id, bio, bio_lang, website) values ($1, $2, 'en', 'https://grace.example.com/notes')`, [
        other.id,
        'I draw with diffusion models.',
      ])
      await other.query(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, $3, 'en')`, [aiArt, other.id, 'A heron in ink, made with Flux.'])
      const followName = p.followName.replace('{name}', 'Grace Profiles')

      // A visitor: who she is, her numbers, her post; 关注 asks to sign in first.
      expect((await page.goto(`/en/u/${other.handle}`))?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1, name: 'Grace Profiles' })).toBeVisible()
      await expect(page.getByText(`@${other.handle}`)).toBeVisible()
      await expect(page.getByText('I draw with diffusion models.')).toHaveAttribute('lang', 'en')
      await expect(page.getByRole('link', { name: 'grace.example.com/notes' })).toHaveAttribute('rel', 'nofollow ugc noopener me')
      await expect(page).toHaveTitle(new RegExp(`^Grace Profiles \\(@${other.handle}\\)`))
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/en/u/${other.handle}$`))
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
      expect(await page.locator('script[type="application/ld+json"]').allTextContents()).toContainEqual(expect.stringContaining('"ProfilePage"'))
      const tabs = page.getByRole('navigation', { name: p.tabsLabel })
      await expect(tabs.getByRole('link', { name: new RegExp(`^${p.tabs.posts}`) })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('listitem').filter({ hasText: 'A heron in ink' })).toBeVisible()
      await page.getByRole('button', { name: followName }).click()
      await expectSignIn(page, c.signInFollow)

      // The address in capitals leads to the address, with the tab; nobody's is a 404.
      const capitals = await request.get(`/en/u/${other.handle.toUpperCase()}?tab=reviews`, { maxRedirects: 0 })
      expect(capitals.status()).toBe(308)
      expect(capitals.headers().location).toMatch(new RegExp(`/en/u/${other.handle}\\?tab=reviews$`))

      // Back from signing in with ?follow=: followed, counted, and the address forgets it.
      await context.addCookies([member.cookie])
      await page.goto(`/en/u/${other.handle}?follow=${other.handle}`)
      const follow = page.getByRole('button', { name: followName })
      await expect(follow).toHaveAttribute('aria-pressed', 'true')
      await expect(follow).toHaveText(p.following)
      await expect(page).toHaveURL(new RegExp(`/en/u/${other.handle}$`))
      await expect(page.getByRole('link', { name: '1 follower', exact: true })).toBeVisible()
      expect((await member.query('select 1 from member_follows where follower_id = $1 and followee_id = $2', [member.id, other.id])).rows).toHaveLength(1)

      // Her followers, out of search: the reader, named as such and without a button.
      await page.getByRole('link', { name: '1 follower', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/en/u/${other.handle}/followers$`))
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      const self = page.getByRole('listitem').filter({ hasText: `@${member.handle}` })
      await expect(self.getByRole('link', { name: c.youNamed.replace('{name}', 'Ada Profiles') })).toBeVisible()
      await expect(self.getByRole('button')).toHaveCount(0)
      // The people the reader follows: her, with her line.
      await page.goto(`/en/u/${member.handle}/following`)
      const grace = page.getByRole('listitem').filter({ hasText: `@${other.handle}` })
      await expect(grace.getByText('I draw with diffusion models.')).toBeVisible()
      await expect(grace.getByRole('button', { name: followName })).toHaveAttribute('aria-pressed', 'true')

      // 关注: her post, with the same button; stopping there stops for good.
      await page.goto('/en/circles?tab=following')
      const feed = page.getByRole('tabpanel')
      const heron = feed.getByRole('listitem').filter({ hasText: 'A heron in ink' })
      await expect(heron.getByRole('link', { name: 'Grace Profiles' })).toHaveAttribute('href', `/en/u/${other.handle}`)
      const onPost = heron.getByRole('button', { name: followName })
      await expect(onPost).toHaveAttribute('aria-pressed', 'true')
      await onPost.click()
      await expect(onPost).toHaveAttribute('aria-pressed', 'false')
      await expect.poll(async () => (await member.query('select 1 from member_follows where follower_id = $1', [member.id])).rows.length).toBe(0)
      await page.reload()
      await expect(feed.getByText(c.followingNoneTitle)).toBeVisible()
      // 值得关注的人 never has the reader in it.
      const people = (await (await page.request.get('/api/circles/people')).json()) as { people: { handle: string }[] }
      expect(people.people.map((person) => person.handle)).not.toContain(member.handle)

      // What the API turns down.
      expect((await page.request.post('/api/follows/members', { data: { handle: member.handle, on: true } })).status()).toBe(422)
      expect((await page.request.post('/api/follows/members', { data: { handle: 'nobody-at-all', on: true } })).status()).toBe(404)
      expect((await page.request.post('/api/follows/members', { data: { handle: other.handle, on: 'yes' } })).status()).toBe(400)
      const crossSite = { 'sec-fetch-site': 'cross-site' }
      expect((await page.request.post('/api/follows/members', { data: { handle: other.handle, on: true }, headers: crossSite })).status()).toBe(403)

      // Two hundred new follows a day: the next one is turned down, and the button goes back.
      await member.query(
        `insert into auth_users (id, name, email, email_verified, handle)
         select $1 || '-' || n, 'Bulk ' || n, $1 || '-' || n || '@example.com', true, 'u-' || substr(md5($1 || n), 1, 10) from generate_series(1, 200) n`,
        [bulk],
      )
      await member.query(`insert into member_follows (follower_id, followee_id) select $1, id from auth_users where id like $2`, [member.id, `${bulk}-%`])
      await page.goto(`/en/u/${other.handle}`)
      await page.getByRole('button', { name: followName }).click()
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(p.followDailyLimit.replace('{limit}', '200'))
      await expect(page.getByRole('button', { name: followName })).toHaveAttribute('aria-pressed', 'false')
      await member.query('delete from auth_users where id like $1', [`${bulk}-%`])
    } finally {
      await member.query('delete from auth_users where id like $1', [`${bulk}-%`])
      await member.remove()
      await other.remove()
    }
  })

  test('a member’s own page, and changing the address in the settings', async ({ page, context, browser, request, baseURL }) => {
    test.slow()
    const site = baseURL ?? 'http://localhost:3000'
    const member = await createMember(site, 'Ada Address')
    const other = await createMember(site, 'Grace Address')
    const others = await browser.newContext({ baseURL: site })
    try {
      await context.addCookies([member.cookie])
      await others.addCookies([other.cookie])
      // An address they chose themselves, more than 30 days ago: they can change it again.
      const before = `ada-${member.id.slice(0, 8)}`
      await member.query('update auth_users set handle = $1 where id = $2', [before, member.id])
      await member.query(`insert into member_profiles (user_id, handle_changed_at) values ($1, now() - interval '40 days')`, [member.id])
      const grace = `grace-${other.id.slice(0, 8)}`
      await other.query('update auth_users set handle = $1 where id = $2', [grace, other.id])

      // Their own page: 编辑资料 and sharing instead of 关注, 收藏 behind a lock; nothing posted, so out of search.
      await page.goto(`/en/u/${before}`)
      await expect(page.getByRole('link', { name: p.editProfile })).toHaveAttribute('href', '/en/me/account')
      await expect(page.getByRole('button', { name: p.followName.replace('{name}', 'Ada Address') })).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: p.tabsLabel }).getByRole('link', { name: new RegExp(`^${p.tabs.saves}`) })).toHaveAttribute(
        'href',
        '/en/me/saves',
      )
      await expect(page.getByText(p.postsEmpty)).toBeVisible()
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

      // The settings: what cannot be saved says why under the field.
      await page.goto('/en/me/account')
      const main = page.getByRole('main')
      const address = main.getByLabel(en.account.handleLabel)
      await expect(address).toHaveValue(before)
      await expect(main.getByText(en.account.handleOnce)).toBeVisible()
      await address.fill('admin')
      await main.getByRole('button', { name: en.account.save }).click()
      await expect(main.getByRole('alert')).toHaveText(en.account.handleReserved)
      await address.fill('ifai-team')
      await main.getByRole('button', { name: en.account.save }).click()
      await expect(main.getByRole('alert')).toHaveText(en.account.handleReserved)
      await address.fill('a--b')
      await main.getByRole('button', { name: en.account.save }).click()
      await expect(main.getByRole('alert')).toHaveText(en.account.handleInvalid)
      await address.fill(grace)
      await main.getByRole('button', { name: en.account.save }).click()
      await expect(main.getByRole('alert')).toHaveText(en.account.handleTaken)

      // Saved: lowercased as typed, the line on one line, the site with https://, and the address locked for 30 days.
      const chosen = `ada-new-${member.id.slice(0, 8)}`
      await address.fill(chosen.toUpperCase())
      await expect(address).toHaveValue(chosen)
      const bio = main.getByLabel(en.account.bioLabel)
      await bio.fill('Painter, and prompt writer')
      await main.getByLabel(en.account.websiteLabel).fill('ada.example.com')
      await main.getByRole('button', { name: en.account.save }).click()
      await expect(main.getByRole('status')).toHaveText(en.account.saved)
      await expect(address).toHaveAttribute('readonly', '')
      await expect(main.getByLabel(en.account.websiteLabel)).toHaveValue('https://ada.example.com/')
      await expect(main.getByRole('link', { name: en.account.viewProfile })).toHaveAttribute('href', `/en/u/${chosen}`)

      // The old address leads to the new one and stays theirs.
      const moved = await request.get(`/en/u/${before}`, { maxRedirects: 0 })
      expect(moved.status()).toBe(308)
      expect(moved.headers().location).toMatch(new RegExp(`/en/u/${chosen}$`))
      const taken = await others.request.patch('/api/account/profile', { data: { handle: before, locale: 'en' } })
      expect(taken.status()).toBe(409)
      expect(await taken.json()).toMatchObject({ error: 'handle-taken' })
      const again = await page.request.patch('/api/account/profile', { data: { handle: `${chosen}-2`, locale: 'en' } })
      expect(again.status()).toBe(429)
      expect(await again.json()).toMatchObject({ error: 'handle-too-soon', nextChange: expect.any(String) })

      // The menu's first line is the new address, and leads to the page.
      await page.goto('/en')
      await page.getByRole('button', { name: en.header.account }).click()
      const top = page.getByRole('link', { name: /Ada Address/ })
      await expect(top).toContainText(en.header.profileLine.replace('{handle}', chosen))
      await top.click()
      await expect(page).toHaveURL(new RegExp(`/en/u/${chosen}$`))
      await expect(page.getByText('Painter, and prompt writer')).toBeVisible()
      await expect(page.getByRole('link', { name: 'ada.example.com' })).toHaveAttribute('href', 'https://ada.example.com/')

      // The download has the page, the old address and the follows, by address only.
      expect((await page.request.post('/api/follows/members', { data: { handle: grace, on: true } })).status()).toBe(200)
      const exported = await (await page.request.get('/api/account/export?locale=en')).json()
      expect(exported.profile).toMatchObject({
        handle: chosen,
        url: expect.stringMatching(new RegExp(`/en/u/${chosen}$`)),
        bio: 'Painter, and prompt writer',
        website: 'https://ada.example.com/',
        oldHandles: [{ handle: before }],
      })
      expect(exported.following).toMatchObject([{ handle: grace }])
      expect(JSON.stringify(exported)).not.toContain(other.email)
    } finally {
      await others.close()
      await member.remove()
      await other.remove()
    }
  })

  test('a member’s reviews and circles on their page', async ({ page, baseURL }) => {
    test.skip(!process.env.E2E_SAMPLE_APPS, 'Run scripts/seed-apps.ts and set E2E_SAMPLE_APPS.')
    const member = await createMember(baseURL ?? 'http://localhost:3000', 'Ada Reviews')
    try {
      const prompts = (await member.query<{ id: number }>(`select id from circles where slug = 'prompts'`)).rows[0].id
      await member.query(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, 'Two prompts I keep using.', 'en')`, [prompts, member.id])
      await member.addReview(await member.appId('lumen-chat'), 'Quick answers, tidy notes.', 5)
      const hidden = await member.addReview(await member.appId('kitecode'), 'Hidden one.', 2)
      await member.query(`update app_reviews set status = 'hidden' where id = $1`, [hidden])

      await page.goto(`/en/u/${member.handle}?tab=reviews`)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      const reviews = page.getByRole('main').getByRole('listitem')
      await expect(reviews).toHaveCount(1)
      await expect(reviews.first().getByRole('link', { name: 'Lumen Chat' })).toHaveAttribute('href', '/en/apps/lumen-chat')
      await expect(reviews.first().getByText('Quick answers, tidy notes.')).toHaveAttribute('lang', 'en')

      await page.goto(`/en/u/${member.handle}?tab=circles`)
      const circle = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Prompts' })
      await expect(circle.getByRole('link', { name: 'Prompts' })).toHaveAttribute('href', '/en/circles?circle=prompts')
      await expect(circle).toContainText('1 post by them')
    } finally {
      await member.remove()
    }
  })
})

/** The sign-in dialog opens, titled for what the visitor pressed, and closes again. */
async function expectSignIn(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}
