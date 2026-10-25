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
  expect((await request.post('/api/account/blocks', { data: { handle: 'nobody-at-all', on: true } })).status()).toBe(launched ? 401 : 404)
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

  test('blocking a member: from their page, what it hides both ways, and the settings', async ({ page, context, browser, request, baseURL }) => {
    test.slow()
    const site = baseURL ?? 'http://localhost:3000'
    const member = await createMember(site, 'Ada Blocks')
    const other = await createMember(site, 'Grace Blocks')
    const others = await browser.newContext({ baseURL: site })
    try {
      await others.addCookies([other.cookie])
      const aiArt = (await member.query<{ id: number }>(`select id from circles where slug = 'ai-art'`)).rows[0].id
      const post = async (userId: string, body: string) =>
        (await member.query<{ id: number }>(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, $3, 'en') returning id`, [aiArt, userId, body]))
          .rows[0].id
      const hers = await post(other.id, 'A heron in ink, blocked or not.')
      const mine = await post(member.id, 'A lighthouse at dusk.')
      // She commented on his post, and they follow each other.
      const comment = (
        await member.query<{ id: number }>(`insert into circle_comments (post_id, user_id, body, lang) values ($1, $2, 'Lovely light.', 'en') returning id`, [
          mine,
          other.id,
        ])
      ).rows[0].id
      await member.query('insert into member_follows (follower_id, followee_id) values ($1, $2), ($2, $1)', [member.id, other.id])
      const more = p.moreName.replace('{name}', 'Grace Blocks')
      const blockName = p.blockName.replace('{name}', 'Grace Blocks')
      const postsBy = async (api: APIRequestContext, handle: string) =>
        ((await (await api.get(`/api/circles/feed?tab=latest&author=${handle}`)).json()) as { posts: { id: number }[] }).posts.map((shown) => shown.id)

      // A visitor is asked to sign in first.
      await page.goto(`/en/u/${other.handle}`)
      await page.getByRole('button', { name: more }).click()
      await page.getByRole('button', { name: blockName }).click()
      await expectSignIn(page, c.signInBlock)

      // Signed in: it asks first; then her page has only its header, and the follows are gone both ways.
      await context.addCookies([member.cookie])
      await page.reload()
      await page.getByRole('button', { name: more }).click()
      await page.getByRole('button', { name: blockName }).click()
      const confirm = page.getByRole('dialog', { name: p.blockTitle.replace('{name}', 'Grace Blocks') })
      await expect(confirm.getByText(p.blockBody)).toBeVisible()
      await confirm.getByRole('button', { name: p.blockConfirm, exact: true }).click()
      await expect(page.getByText(p.blockedByYou.replace('{name}', 'Grace Blocks'))).toBeVisible()
      await expect(confirm).toBeHidden()
      await expect(page.getByRole('heading', { level: 1, name: 'Grace Blocks' })).toBeVisible()
      await expect(page.getByRole('button', { name: p.followName.replace('{name}', 'Grace Blocks') })).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: p.tabsLabel })).toHaveCount(0)
      expect((await member.query('select 1 from member_follows where follower_id = any($1)', [[member.id, other.id]])).rows).toHaveLength(0)

      // Neither sees the other's posts, nor her comment and its count; a visitor sees everything.
      expect(await postsBy(page.request, other.handle)).toEqual([])
      expect(await postsBy(others.request, member.handle)).toEqual([])
      expect(await postsBy(request, other.handle)).toEqual([hers])
      expect((await page.goto(`/en/circles/p/${hers}`))?.status()).toBe(404)
      expect((await request.get(`/en/circles/p/${hers}`)).status()).toBe(200)
      expect(await (await page.request.get(`/api/circles/comments?post=${mine}`)).json()).toMatchObject({ count: 0, comments: [] })
      expect(await (await request.get(`/api/circles/comments?post=${mine}`)).json()).toMatchObject({ count: 1, comments: [{ id: comment }] })
      expect((await others.request.get(`/api/circles/comments?post=${mine}`)).status()).toBe(404)

      // Nor her face among the last people to post on a circle's card: she posted last in Desks & Gear.
      const desks = (await member.query<{ id: number }>(`select id from circles where slug = 'desks-and-gear'`)).rows[0].id
      const shelf = (
        await member.query<{ id: number }>(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, 'A walnut monitor shelf.', 'en') returning id`, [
          desks,
          other.id,
        ])
      ).rows[0].id
      const faces = async (api: APIRequestContext) => {
        const { overview } = (await (await api.get('/api/circles/feed?tab=latest')).json()) as {
          overview: { circles: { id: number; recent: { name: string }[] }[] }
        }
        return overview.circles.find((circle) => circle.id === desks)?.recent.map((person) => person.name) ?? []
      }
      expect(await faces(request)).toContain('Grace Blocks')
      expect(await faces(page.request)).not.toContain('Grace Blocks')
      await member.query('delete from circle_posts where id = $1', [shelf])

      // Neither can follow, react to, comment on or answer the other.
      const followHim = await others.request.post('/api/follows/members', { data: { handle: member.handle, on: true } })
      expect(followHim.status()).toBe(403)
      expect(await followHim.json()).toMatchObject({ error: 'blocked' })
      expect((await page.request.post('/api/follows/members', { data: { handle: other.handle, on: true } })).status()).toBe(403)
      expect((await page.request.post('/api/circles/reactions', { data: { post: hers, reaction: 'like', on: true } })).status()).toBe(404)
      expect((await others.request.post('/api/circles/comments', { data: { post: mine, body: 'Me again.', locale: 'en' } })).status()).toBe(404)
      expect((await page.request.post('/api/circles/comments', { data: { post: mine, body: 'Thanks!', locale: 'en', replyTo: comment } })).status()).toBe(422)

      // What the blocks API turns down.
      const crossSite = { 'sec-fetch-site': 'cross-site' }
      expect((await page.request.post('/api/account/blocks', { data: { handle: member.handle, on: true } })).status()).toBe(422)
      expect((await page.request.post('/api/account/blocks', { data: { handle: 'nobody-at-all', on: true } })).status()).toBe(404)
      expect((await page.request.post('/api/account/blocks', { data: { handle: other.handle, on: 'yes' } })).status()).toBe(400)
      expect((await page.request.post('/api/account/blocks', { data: { handle: other.handle, on: true }, headers: crossSite })).status()).toBe(403)

      // Her side: his page says why it is empty, and 更多 can still block and report him.
      const hersPage = await others.newPage()
      await hersPage.goto(`/en/u/${member.handle}`)
      await expect(hersPage.getByText(p.blockedYou.replace('{name}', 'Ada Blocks'))).toBeVisible()
      await expect(hersPage.getByRole('button', { name: p.followName.replace('{name}', 'Ada Blocks') })).toHaveCount(0)
      await hersPage.getByRole('button', { name: p.moreName.replace('{name}', 'Ada Blocks') }).click()
      await expect(hersPage.getByRole('button', { name: p.blockName.replace('{name}', 'Ada Blocks') })).toBeVisible()
      await expect(hersPage.getByRole('button', { name: c.report, exact: true })).toBeVisible()

      // The download has whom they blocked; whom someone else blocked is not in theirs.
      expect((await (await page.request.get('/api/account/export?locale=en')).json()).blocking).toMatchObject([{ handle: other.handle }])
      expect((await (await others.request.get('/api/account/export?locale=en')).json()).blocking).toEqual([])

      // 隐私 lists her. Unblocking from her page brings the page back, not the follows.
      await page.goto('/en/me/account?section=privacy')
      const main = page.getByRole('main')
      await expect(main.getByRole('heading', { name: en.account.blockedTitle })).toBeVisible()
      await expect(main.getByRole('link', { name: 'Grace Blocks' })).toHaveAttribute('href', `/en/u/${other.handle}`)
      await page.goto(`/en/u/${other.handle}`)
      await page.getByRole('main').getByRole('button', { name: p.unblock, exact: true }).click()
      await expect(page.getByRole('button', { name: p.followName.replace('{name}', 'Grace Blocks') })).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('navigation', { name: p.tabsLabel })).toBeVisible()
      expect(await postsBy(page.request, other.handle)).toEqual([hers])

      // Blocked again, and unblocked from the settings: off the list at once.
      expect(await (await page.request.post('/api/account/blocks', { data: { handle: other.handle, on: true } })).json()).toEqual({ blocked: true })
      await page.goto('/en/me/account?section=privacy')
      await main.getByRole('button', { name: en.account.unblockName.replace('{name}', 'Grace Blocks') }).click()
      await expect(main.getByText(en.account.blockedNone)).toBeVisible()
      await expect.poll(async () => (await member.query('select 1 from member_blocks where blocker_id = $1', [member.id])).rows.length).toBe(0)
    } finally {
      await others.close()
      await member.remove()
      await other.remove()
    }
  })

  test('reporting a member from their page', async ({ page, context, baseURL }) => {
    const site = baseURL ?? 'http://localhost:3000'
    const member = await createMember(site, 'Ada Reports')
    const other = await createMember(site, 'Grace Reports')
    try {
      const more = p.moreName.replace('{name}', 'Grace Reports')

      // A visitor can report too: one of the five reasons for members, then thanks, and 已举报.
      await page.goto(`/en/u/${other.handle}`)
      await page.getByRole('button', { name: more }).click()
      await page.getByRole('button', { name: c.report, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: c.reportMemberTitle })
      await expect(dialog.getByText(c.reportMemberBody)).toBeVisible()
      await expect(dialog.getByRole('radio')).toHaveCount(5)
      await dialog.getByRole('radio', { name: c.memberReasons.impersonation }).check()
      await dialog.getByRole('button', { name: c.reportSend, exact: true }).click()
      await expect(dialog.getByRole('status')).toHaveText(c.reportDone)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: more }).click()
      await expect(page.getByRole('button', { name: c.reported, exact: true })).toBeDisabled()

      // A member: once per reporter, not themselves, only a member who is there, only the members' reasons.
      await context.addCookies([member.cookie])
      expect(await (await page.request.post('/api/circles/report', { data: { member: other.handle, reason: 'profile' } })).json()).toEqual({ reported: true })
      expect((await page.request.post('/api/circles/report', { data: { member: other.handle.toUpperCase(), reason: 'spam' } })).status()).toBe(200)
      const own = await page.request.post('/api/circles/report', { data: { member: member.handle, reason: 'spam' } })
      expect(own.status()).toBe(400)
      expect(await own.json()).toMatchObject({ error: 'own-profile' })
      expect((await page.request.post('/api/circles/report', { data: { member: 'nobody-at-all', reason: 'spam' } })).status()).toBe(404)
      expect((await page.request.post('/api/circles/report', { data: { member: other.handle, reason: 'offTopic' } })).status()).toBe(400)
      const reports = await member.query<{ reporter: string; reason: string }>('select reporter, reason from member_reports where user_id = $1 order by id', [other.id])
      expect(reports.rows).toEqual([
        { reporter: expect.stringMatching(/^v:/), reason: 'impersonation' },
        { reporter: `u:${member.id}`, reason: 'profile' },
      ])

      // What the site owner sees and does is for admins only.
      expect((await page.request.get('/api/circles/member-reports')).status()).toBe(401)
      expect((await page.request.post(`/api/circles/member-reports/${other.id}`, { data: { keep: true } })).status()).toBe(401)

      // The download lists whom they reported, by address.
      const exported = await (await page.request.get('/api/account/export?locale=en')).json()
      expect(exported.memberReports).toMatchObject([{ handle: other.handle, reason: 'profile', resolvedAt: null }])
    } finally {
      await member.remove()
      await other.remove()
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
