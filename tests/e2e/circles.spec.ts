import { readFileSync } from 'node:fs'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import sharp from 'sharp'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const c = en.circles
const nowhere = 2_000_000_000

/** Circles launch in phase two (NEXT_PUBLIC_SITE_PHASE ≥ 2, as CI builds); the server says which phase it was built for. */
async function circlesLaunched(request: APIRequestContext): Promise<boolean> {
  return (await request.get('/api/circles/feed')).status() !== 404
}

test('the circles page, its API and its link come together', async ({ page, request }) => {
  const launched = await circlesLaunched(request)
  expect((await page.goto('/en/circles'))?.status()).toBe(launched ? 200 : 404)
  await page.goto('/en')
  await expect(page.getByRole('navigation', { name: en.nav.label }).getByRole('link', { name: en.nav.circles })).toHaveCount(launched ? 1 : 0)
})

test.describe('the circles', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await circlesLaunched(request)), 'Circles launch in phase two: build with NEXT_PUBLIC_SITE_PHASE=2, as CI does.')
  })

  test('the circles API answers readers, and only members can write', async ({ request }) => {
    const feed = await request.get('/api/circles/feed')
    expect(feed.status()).toBe(200)
    expect(feed.headers()['cache-control']).toBe('private, no-store')
    expect(await feed.json()).toMatchObject({ signedIn: false, joined: [], overview: { circles: expect.any(Array) } })
    expect((await request.get('/api/circles/feed?tab=following')).status()).toBe(400)
    expect((await request.get('/api/circles/feed?cursor=abc')).status()).toBe(400)
    expect((await request.get(`/api/circles/feed?circle=${nowhere}`)).status()).toBe(404)
    // 我的圈子 for a visitor: nothing to show, not an error.
    expect(await (await request.get('/api/circles/feed?tab=mine')).json()).toMatchObject({ posts: [], next: null })

    const post = { circle: 1, body: 'Hello', locale: 'en' }
    expect((await request.post('/api/circles/posts', { data: post })).status()).toBe(401)
    expect((await request.post('/api/circles/posts', { data: { ...post, body: ' ' } })).status()).toBe(400)
    expect((await request.post('/api/circles/posts', { data: post, headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403)
    expect((await request.delete('/api/circles/posts?id=1')).status()).toBe(401)
    expect((await request.post('/api/circles/members', { data: { circle: 1, joined: true } })).status()).toBe(401)
    expect((await request.post('/api/circles/reactions', { data: { post: 1, reaction: 'rocket', on: true } })).status()).toBe(401)
    expect((await request.post('/api/circles/reactions', { data: { post: 1, reaction: 'clap', on: true } })).status()).toBe(400)

    expect((await request.post('/api/circles/report', { data: { post: 1, reason: 'boring' } })).status()).toBe(400)
    expect((await request.post('/api/circles/report', { data: { post: nowhere, reason: 'spam' } })).status()).toBe(404)
    const fromElsewhere = await request.post('/api/circles/report', { data: { post: 1, reason: 'spam' }, headers: { 'sec-fetch-site': 'cross-site' } })
    expect(fromElsewhere.status()).toBe(403)

    // Pictures and video links, for members writing a post on IFAI's own pages.
    const file = { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await picture('#3d7dd9') }
    const crossSite = { 'sec-fetch-site': 'cross-site' }
    expect((await request.post('/api/circles/images', { multipart: { file } })).status()).toBe(401)
    expect((await request.post('/api/circles/images', { multipart: { file }, headers: crossSite })).status()).toBe(403)
    const video = { url: 'https://youtu.be/dQw4w9WgXcQ' }
    expect((await request.post('/api/circles/videos', { data: video })).status()).toBe(401)
    expect((await request.post('/api/circles/videos', { data: video, headers: crossSite })).status()).toBe(403)
    expect((await request.post('/api/circles/videos', { data: { url: ' ' } })).status()).toBe(400)
  })

  test('a visitor sees the circles and is asked to sign in to join, post or react', async ({ page }) => {
    const response = await page.goto('/en/circles')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: c.title })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    const cards = page.getByRole('region', { name: c.circlesLabel })
    for (const name of ['AI Art', 'Agent Workflows', 'Prompts', 'Desks & Gear', 'Jobs & Careers']) {
      await expect(cards.getByRole('link', { name: `# ${name}` })).toBeVisible()
    }

    await cards.getByRole('button', { name: c.joinName.replace('{name}', 'Prompts') }).click()
    await expectSignIn(page, c.signInJoin)
    await page.getByRole('button', { name: c.composerLabel }).click()
    await expectSignIn(page, c.signInPost)

    await page.getByRole('tab', { name: c.tabs.mine }).click()
    await expect(page).toHaveURL(/\/en\/circles\?tab=mine$/)
    await expect(page.getByRole('tabpanel').getByText(c.mineSignIn)).toBeVisible()

    // One circle's posts: its own address, out of search, and no 我的圈子 tab.
    await cards.getByRole('link', { name: '# AI Art' }).click()
    await expect(page).toHaveURL(/\/en\/circles\?circle=ai-art$/)
    await expect(page.getByRole('tab', { name: c.tabs.mine })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: c.tabs.hot })).toHaveAttribute('aria-selected', 'true')
    await page.goto('/en/circles?circle=ai-art')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('a member joins, posts, reacts, reports and deletes', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    const member = await createMember(baseURL ?? 'http://localhost:3000', 'Ada Circles')
    const other = await createMember(baseURL ?? 'http://localhost:3000', 'Grace Circles')
    try {
      const circleId = async (slug: string) => (await member.query<{ id: number }>('select id from circles where slug = $1', [slug])).rows[0].id
      const aiArt = await circleId('ai-art')
      const prompts = await circleId('prompts')
      const theirs = (
        await other.query<{ id: number }>(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, $3, 'en') returning id`, [
          aiArt,
          other.id,
          'A watercolor fox, made with Flux: https://example.com/fox. <b>Not bold</b>',
        ])
      ).rows[0].id
      await context.addCookies([member.cookie])

      // Back from signing in with ?join=: the circle is joined, and the address forgets it.
      await page.goto('/en/circles?tab=latest&join=prompts')
      const cards = page.getByRole('region', { name: c.circlesLabel })
      await expect(cards.getByRole('button', { name: c.joinName.replace('{name}', 'Prompts') })).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/\/en\/circles\?tab=latest$/)
      const mine = page.getByRole('region', { name: c.myCircles })
      await expect(mine.getByRole('link', { name: 'Prompts' })).toBeVisible()

      // Someone else's post: the address is a link that passes nothing on, the markup stays text.
      const feed = page.getByRole('tabpanel')
      const fox = feed.getByRole('listitem').filter({ hasText: 'A watercolor fox' })
      await expect(fox.getByRole('link', { name: 'https://example.com/fox' })).toHaveAttribute('rel', /nofollow ugc/)
      await expect(fox.getByText('<b>Not bold</b>', { exact: false })).toBeVisible()

      // Posting into another circle joins it, and the post comes first in 最新.
      await page.getByRole('textbox', { name: c.composerLabel }).fill('My first post, about prompts.')
      await page.getByRole('combobox', { name: c.postTo }).selectOption({ label: '# AI Art' })
      await page.getByRole('button', { name: c.publish, exact: true }).click()
      const own = feed.getByRole('listitem').first()
      await expect(own).toContainText('My first post, about prompts.')
      await expect(own).toContainText(c.youNamed.replace('{name}', 'Ada Circles'))
      await expect(page.getByRole('textbox', { name: c.composerLabel })).toHaveValue('')
      await expect(cards.getByRole('button', { name: c.joinName.replace('{name}', 'AI Art') })).toHaveAttribute('aria-pressed', 'true')

      // A reaction: on, counted with them in it, and off again.
      await fox.getByRole('button', { name: c.addReaction }).click()
      await fox.getByRole('group', { name: c.reactionsGroup }).getByRole('button', { name: c.reactionNames.rocket }).click()
      const rocket = fox.getByRole('button', { name: `${c.reactionNames.rocket}: 1 person, including you` })
      await expect(rocket).toHaveAttribute('aria-pressed', 'true')
      await rocket.click()
      await expect(fox.getByRole('button', { name: new RegExp(`^${c.reactionNames.rocket}:`) })).toHaveCount(0)
      await fox.getByRole('button', { name: c.addReaction }).click()
      await fox.getByRole('group', { name: c.reactionsGroup }).getByRole('button', { name: c.reactionNames.insight }).click()
      await expect(fox.getByRole('button', { name: `${c.reactionNames.insight}: 1 person, including you` })).toBeVisible()

      // Reporting theirs; their own has no such button.
      await fox.getByRole('button', { name: c.moreName.replace('{name}', 'Grace Circles') }).click()
      await fox.getByRole('button', { name: c.report, exact: true }).click()
      const report = page.getByRole('dialog', { name: c.reportTitle })
      await expect(report.getByRole('button', { name: c.reportSend })).toBeDisabled()
      await report.getByLabel(c.reasons.offTopic).check()
      await report.getByRole('button', { name: c.reportSend }).click()
      await expect(report.getByText(c.reportDone)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(report).toBeHidden()
      const reported = await member.query(`select reason from circle_post_reports where post_id = $1 and reporter = $2`, [theirs, `u:${member.id}`])
      expect(reported.rows).toEqual([{ reason: 'offTopic' }])

      // What the export says about it all.
      const exported = await (await page.request.get('/api/account/export?locale=en')).json()
      expect(exported.circles.map((row: { circle: { name: string } }) => row.circle.name).sort()).toEqual(['AI Art', 'Prompts'])
      expect(exported.circlePosts).toMatchObject([{ text: 'My first post, about prompts.', status: 'shown', circle: { id: aiArt, name: 'AI Art' } }])
      expect(exported.circleReactions).toMatchObject([{ post: theirs, reaction: 'insight' }])
      expect(exported.circlePostReports).toMatchObject([{ post: theirs, reason: 'offTopic', resolvedAt: null }])
      expect(JSON.stringify(exported)).not.toContain('A watercolor fox')
      // The settings page says what the download and deleting the account take from the circles.
      const settings = await context.newPage()
      await settings.goto('/en/me/account?section=data')
      await expect(settings.getByText(en.account.exportCircles)).toBeVisible()
      await expect(settings.getByText(en.account.deleteCircles)).toBeVisible()
      await settings.close()

      // Hidden by the site owner: gone for others, still there for its author, with a note.
      await member.query(`update circle_posts set status = 'hidden' where id = $1`, [theirs])
      await page.reload()
      await expect(feed.getByText('A watercolor fox')).toHaveCount(0)
      await expect(feed.getByText('My first post, about prompts.')).toBeVisible()

      // Deleting their own, after saying yes.
      await feed.getByRole('button', { name: c.moreName.replace('{name}', 'Ada Circles') }).click()
      await feed.getByRole('button', { name: c.delete, exact: true }).click()
      await feed.getByRole('group', { name: c.deleteConfirm }).getByRole('button', { name: c.deleteYes }).click()
      await expect(feed.getByText('My first post, about prompts.')).toHaveCount(0)
      expect((await member.query(`select id from circle_posts where user_id = $1`, [member.id])).rows).toEqual([])

      // Ten a day: the eleventh is turned down.
      await member.query(`insert into circle_posts (circle_id, user_id, body, lang) select $1, $2, 'Post ' || n, 'en' from generate_series(1, 10) n`, [
        prompts,
        member.id,
      ])
      await page.getByRole('textbox', { name: c.composerLabel }).fill('One too many')
      await page.getByRole('button', { name: c.publish, exact: true }).click()
      await expect(page.getByRole('form', { name: c.composerLabel }).getByRole('alert')).toHaveText(
        c.errors.dailyLimit.replace('{limit}', '10'),
      )

      // The author of a hidden post still sees it, with the note.
      await context.clearCookies()
      await context.addCookies([other.cookie])
      await page.goto('/en/circles?tab=latest&circle=ai-art')
      const hidden = page.getByRole('tabpanel').getByRole('listitem').filter({ hasText: 'A watercolor fox' })
      await expect(hidden.getByText(c.hiddenNote)).toBeVisible()
      await expect(hidden.getByRole('button', { name: c.addReaction })).toHaveCount(0)
    } finally {
      await member.remove()
      await other.remove()
    }
  })

  test('a member posts pictures and a video link', async ({ page, context, request, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    // Uploads, and a video site that may take a few seconds to say it has no such video.
    test.slow()
    const member = await createMember(baseURL ?? 'http://localhost:3000', 'Ada Pictures')
    try {
      const aiArt = (await member.query<{ id: number }>(`select id from circles where slug = 'ai-art'`)).rows[0].id
      const fileName = async (id: number) => (await member.query<{ filename: string }>('select filename from circle_images where id = $1', [id])).rows[0].filename
      await context.addCookies([member.cookie])
      const api = page.request

      // Only pictures, read from the bytes, and at most 4 MB of them.
      const jpeg = { name: 'photo.jpg', mimeType: 'image/jpeg' }
      const svg = { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }
      expect((await api.post('/api/circles/images', { multipart: { file: svg } })).status()).toBe(422)
      expect((await api.post('/api/circles/images', { multipart: { file: { ...jpeg, buffer: Buffer.from('not a picture') } } })).status()).toBe(422)
      expect((await api.post('/api/circles/images', { multipart: { file: { ...jpeg, buffer: Buffer.alloc(5 * 1024 * 1024) } } })).status()).toBe(413)
      const unsupported = await api.post('/api/circles/videos', { data: { url: 'https://example.com/watch?v=dQw4w9WgXcQ' } })
      expect(unsupported.status()).toBe(422)
      expect(await unsupported.json()).toEqual({ error: 'unsupported-video' })

      // Three pictures in one post. Nobody can open them before the post is published, nor post them twice.
      const ids: number[] = []
      for (const color of ['#d94f3d', '#3dd97d', '#3d7dd9']) {
        const buffer = await picture(color, { png: true })
        const uploaded = await api.post('/api/circles/images', { multipart: { file: { name: 'shot.png', mimeType: 'image/png', buffer } } })
        expect(uploaded.status()).toBe(200)
        ids.push(((await uploaded.json()) as { image: { id: number } }).image.id)
      }
      const firstFile = `/api/circle-images/file/${await fileName(ids[0])}`
      expect((await request.get(firstFile)).status()).toBe(403)
      const posted = await api.post('/api/circles/posts', { data: { circle: aiArt, body: 'Three tries at the same prompt', locale: 'en', images: ids } })
      expect(posted.status()).toBe(200)
      expect((await request.get(firstFile)).status()).toBe(200)
      const twice = await api.post('/api/circles/posts', { data: { circle: aiArt, body: 'Again', locale: 'en', images: [ids[0]] } })
      expect(await twice.json()).toEqual({ error: 'invalid-images' })

      // The grid, and the viewer: arrows, keys, Esc.
      await page.goto('/en/circles?tab=latest')
      const feed = page.getByRole('tabpanel')
      const three = feed.getByRole('listitem').filter({ hasText: 'Three tries at the same prompt' })
      const view = (index: number, count: number) => c.viewImage.replace('{index}', String(index)).replace('{count}', String(count))
      await expect(three.getByRole('button', { name: /^View picture \d of 3$/ })).toHaveCount(3)
      await three.getByRole('button', { name: view(2, 3) }).click()
      const viewer = page.getByRole('dialog', { name: c.imageViewer })
      await expect(viewer.getByText('2 / 3')).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await expect(viewer.getByText('3 / 3')).toBeVisible()
      await expect(viewer.getByRole('button', { name: c.nextImage })).toHaveCount(0)
      await viewer.getByRole('button', { name: c.previousImage }).click()
      await expect(viewer.getByText('2 / 3')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(viewer).toBeHidden()

      // From the post box: a photo taken sideways, with EXIF, and a video link, and no text.
      const photo = await sharp(await picture('#3d7dd9', { width: 300, height: 200 }))
        .withExif({ IFD0: { Artist: 'Smoke test', Copyright: 'Somewhere secret' } })
        .withMetadata({ orientation: 6 })
        .toBuffer()
      const form = page.getByRole('form', { name: c.composerLabel })
      await expect(form.getByRole('textbox', { name: c.composerLabel })).toBeEnabled()
      await form.locator('input[type=file]').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: photo })
      const drafts = form.getByRole('list', { name: c.draftImages.replace('{count}', '1').replace('{max}', '9') })
      await expect(drafts.getByRole('img', { name: c.imageNumber.replace('{index}', '1') })).toBeVisible()
      await expect(drafts.getByText(c.uploading)).toHaveCount(0)
      await expect(drafts.getByRole('button', { name: c.retryUpload })).toHaveCount(0)
      await form.getByRole('button', { name: c.addVideo }).click()
      const videoLink = form.getByRole('textbox', { name: c.videoLink })
      // No video has this id: the card is a plain link.
      await videoLink.fill('https://youtu.be/-----------?t=42')
      await videoLink.press('Enter')
      await expect(form.getByText(c.videoNoInfo.replace('{site}', 'YouTube'))).toBeVisible({ timeout: 20_000 })
      await form.getByRole('button', { name: c.publish, exact: true }).click()
      await expect(drafts).toHaveCount(0)

      const own = feed.getByRole('listitem').first()
      const watch = own.getByRole('link', { name: new RegExp(`^${c.watchOn.replace('{site}', 'YouTube')}`) })
      await expect(watch).toHaveAttribute('href', 'https://www.youtube.com/watch?v=-----------')
      await expect(watch).toHaveAttribute('rel', /nofollow ugc/)
      await own.getByRole('button', { name: view(1, 1) }).click()
      const full = page.getByRole('dialog', { name: c.imageViewer }).getByRole('img', { name: c.imageNumber.replace('{index}', '1') })
      await expect(full).toBeVisible()
      const fullUrl = (await full.getAttribute('src')) ?? ''
      await page.keyboard.press('Escape')

      // What readers get: WebP, turned upright, and nothing of the EXIF.
      const served = await request.get(fullUrl)
      expect(served.status()).toBe(200)
      expect(served.headers()['content-type']).toBe('image/webp')
      const kept = await sharp(await served.body()).metadata()
      expect({ format: kept.format, width: kept.width, height: kept.height, exif: kept.exif, orientation: kept.orientation }).toEqual({
        format: 'webp',
        width: 200,
        height: 300,
        exif: undefined,
        orientation: undefined,
      })

      // The export lists the post's pictures and video.
      const exported = await (await api.get('/api/account/export?locale=en')).json()
      expect(exported.circlePosts.find((post: { text: string }) => post.text === '')).toMatchObject({
        images: [expect.stringMatching(/\/api\/circle-images\/file\/[0-9a-f]{24}\.webp$/)],
        video: { site: 'youtube', url: 'https://www.youtube.com/watch?v=-----------', title: null },
      })

      // Deleting the post deletes its pictures.
      const postId = (await member.query<{ id: number }>(`select id from circle_posts where user_id = $1 and body = ''`, [member.id])).rows[0].id
      await own.getByRole('button', { name: c.moreName.replace('{name}', 'Ada Pictures') }).click()
      await own.getByRole('button', { name: c.delete, exact: true }).click()
      await own.getByRole('group', { name: c.deleteConfirm }).getByRole('button', { name: c.deleteYes }).click()
      await expect(feed.getByRole('link', { name: new RegExp(`^${c.watchOn.replace('{site}', 'YouTube')}`) })).toHaveCount(0)
      await expect.poll(async () => (await member.query('select id from circle_images where post = $1', [postId])).rows).toEqual([])
      expect((await request.get(fullUrl)).status()).toBe(403)
    } finally {
      await member.query('delete from circle_images where uploader = $1', [member.id])
      await member.query('delete from circle_videos where requested_by = $1', [member.id])
      await member.remove()
    }
  })

  test('the comments API answers readers, and only members can comment', async ({ page, request }) => {
    expect((await request.get('/api/circles/comments')).status()).toBe(400)
    expect((await request.get('/api/circles/comments?post=abc')).status()).toBe(400)
    expect((await request.get(`/api/circles/comments?post=${nowhere}`)).status()).toBe(404)
    const comment = { post: 1, body: 'Nice', locale: 'en' }
    expect((await request.post('/api/circles/comments', { data: comment })).status()).toBe(401)
    expect((await request.post('/api/circles/comments', { data: { ...comment, body: ' ' } })).status()).toBe(400)
    expect((await request.post('/api/circles/comments', { data: { ...comment, replyTo: 'first' } })).status()).toBe(400)
    expect((await request.post('/api/circles/comments', { data: comment, headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403)
    expect((await request.delete('/api/circles/comments?id=1')).status()).toBe(401)
    expect((await request.post('/api/circles/report', { data: { comment: nowhere, reason: 'spam' } })).status()).toBe(404)
    expect((await request.post('/api/circles/report', { data: { post: 1, comment: 1, reason: 'spam' } })).status()).toBe(400)
    expect((await page.goto(`/en/circles/p/${nowhere}`))?.status()).toBe(404)
    expect((await page.goto('/en/circles/p/abc'))?.status()).toBe(404)
  })

  test('a post’s page: comments, replies, reports, and who can open it', async ({ page, context, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
      'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
    )
    test.slow()
    const site = baseURL ?? 'http://localhost:3000'
    const member = await createMember(site, 'Ada Comments')
    const other = await createMember(site, 'Grace Comments')
    try {
      const aiArt = (await member.query<{ id: number }>(`select id from circles where slug = 'ai-art'`)).rows[0].id
      const addPost = async (body: string, lang: string) =>
        (await other.query<{ id: number }>(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, $3, $4) returning id`, [aiArt, other.id, body, lang]))
          .rows[0].id
      const addComment = async (author: typeof member, postId: number, body: string, parent: number | null = null, replyTo: number | null = null) =>
        (
          await author.query<{ id: number }>(
            `insert into circle_comments (post_id, user_id, parent_id, reply_to_id, body, lang) values ($1, $2, $3, $4, $5, 'en') returning id`,
            [postId, author.id, parent, replyTo, body],
          )
        ).rows[0].id
      const text = '这周用同一套提示词跑了不同风格的插画，最喜欢第三张的配色。附上参数，欢迎一起调。'
      const theirs = await addPost(text, 'zh-Hans')
      const thanks = await addComment(other, theirs, 'Thanks! The palette is from an old poster.')
      const promptToo = await addComment(other, theirs, 'Happy to share the prompt too.', thanks)

      // A visitor: the post and its comments are in the page, canonical in the post's own language.
      expect((await page.goto(`/en/circles/p/${theirs}`))?.status()).toBe(200)
      await expect(page).toHaveTitle('Grace Comments: 这周用同一套提示词跑了不同风格的插画，最喜欢第三张的配色。附… · IFAI')
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/zh-hans/circles/p/${theirs}$`))
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0)
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
      const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '[]') as Record<string, unknown>[]
      expect(jsonLd[0]).toMatchObject({
        '@type': 'DiscussionForumPosting',
        text,
        inLanguage: 'zh-Hans',
        author: { name: 'Grace Comments' },
        commentCount: 2,
        comment: [{ text: 'Thanks! The palette is from an old poster.', comment: [{ text: 'Happy to share the prompt too.' }] }],
      })
      expect(jsonLd[1]).toMatchObject({ '@type': 'BreadcrumbList' })
      const post = page.getByRole('article')
      await expect(post).toContainText(text)
      await expect(post.getByRole('button', { name: c.share })).toBeVisible()
      await expect(page.getByRole('navigation', { name: c.breadcrumb }).getByRole('link', { name: '# AI Art' })).toHaveAttribute('href', '/en/circles?circle=ai-art')
      const section = page.locator('#comments')
      await expect(section.getByRole('heading', { name: 'Comments 2' })).toBeVisible()
      await section.getByRole('button', { name: c.commentLabel }).click()
      await expectSignIn(page, c.signInComment)
      await section.getByRole('button', { name: c.replyName.replace('{name}', 'Grace Comments') }).first().click()
      await expectSignIn(page, c.signInComment)

      // A member comments; it comes first. Too long is turned down before it is sent.
      await context.addCookies([member.cookie])
      await page.reload()
      const box = section.getByRole('textbox', { name: c.commentLabel })
      const form = section.getByRole('form', { name: c.commentLabel })
      await box.fill('x'.repeat(501))
      await form.getByRole('button', { name: c.publish, exact: true }).click()
      await expect(form.getByRole('alert')).toHaveText(c.errors.tooLong.replace('{max}', '500'))
      await box.fill('Which model did you use?')
      await form.getByRole('button', { name: c.publish, exact: true }).click()
      await expect(box).toHaveValue('')
      await expect(section.getByRole('listitem').first()).toContainText('Which model did you use?')
      await expect(section.getByRole('heading', { name: 'Comments 3' })).toBeVisible()

      // Replying to a reply says whom it answers, and goes under the same comment. Esc closes the box.
      const thread = section.getByRole('listitem').filter({ hasText: 'Thanks! The palette' }).first()
      const replies = thread.getByRole('list', { name: c.repliesLabel.replace('{name}', 'Grace Comments') })
      const replyBox = thread.getByRole('textbox', { name: c.replyName.replace('{name}', 'Grace Comments') })
      await replies.getByRole('button', { name: c.replyName.replace('{name}', 'Grace Comments') }).click()
      await expect(replyBox).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(replyBox).toHaveCount(0)
      await replies.getByRole('button', { name: c.replyName.replace('{name}', 'Grace Comments') }).click()
      await replyBox.fill('Yes please!')
      await thread.getByRole('button', { name: c.reply, exact: true }).click()
      await expect(replies.getByRole('listitem')).toHaveCount(2)
      await expect(replies.getByRole('listitem').last()).toContainText(`${c.replyTo.replace('{name}', 'Grace Comments')}Yes please!`)
      const answer = await member.query(`select parent_id, reply_to_id from circle_comments where user_id = $1 and body = 'Yes please!'`, [member.id])
      expect(answer.rows).toEqual([{ parent_id: thanks, reply_to_id: promptToo }])

      // Three replies first, the rest on request.
      for (const n of [1, 2, 3]) await addComment(other, theirs, `More reply ${n}`, thanks)
      await page.reload()
      await expect(replies.getByRole('listitem')).toHaveCount(3)
      await thread.getByRole('button', { name: 'Show 2 more replies' }).click()
      await expect(replies.getByRole('listitem')).toHaveCount(5)
      await expect(replies.getByRole('listitem').last()).toContainText('More reply 3')

      // Reporting theirs.
      await thread.getByRole('button', { name: c.commentMore.replace('{name}', 'Grace Comments') }).first().click()
      await thread.getByRole('button', { name: c.report, exact: true }).click()
      const report = page.getByRole('dialog', { name: c.reportCommentTitle })
      await report.getByLabel(c.offTopicComment).check()
      await report.getByRole('button', { name: c.reportSend }).click()
      await expect(report.getByText(c.reportDone)).toBeVisible()
      await page.keyboard.press('Escape')
      const reported = await member.query(`select reason from circle_comment_reports where comment_id = $1 and reporter = $2`, [thanks, `u:${member.id}`])
      expect(reported.rows).toEqual([{ reason: 'offTopic' }])

      // Deleting their own comment, after saying yes; the reply under it goes too.
      const own = (await member.query<{ id: number }>(`select id from circle_comments where user_id = $1 and parent_id is null`, [member.id])).rows[0].id
      await addComment(other, theirs, 'GPT Image, mostly.', own)
      await page.reload()
      const ownThread = section.getByRole('listitem').filter({ hasText: 'Which model did you use?' }).first()
      await ownThread.getByRole('button', { name: c.commentMore.replace('{name}', 'Ada Comments') }).click()
      await ownThread.getByRole('button', { name: c.delete, exact: true }).click()
      const confirm = ownThread.getByRole('group', { name: c.deleteCommentConfirm })
      await expect(confirm).toContainText('The reply under it goes too.')
      await confirm.getByRole('button', { name: c.deleteYes }).click()
      await expect(section.getByText('Which model did you use?')).toHaveCount(0)
      await expect(section.getByRole('heading', { name: 'Comments 6' })).toBeVisible()
      expect((await member.query(`select id from circle_comments where id = $1 or parent_id = $1`, [own])).rows).toEqual([])

      // The feed counts them and links to them.
      await page.goto('/en/circles?tab=latest&circle=ai-art')
      const inFeed = page.getByRole('tabpanel').getByRole('listitem').filter({ hasText: text }).first()
      await expect(inFeed.getByRole('link', { name: '6 comments' })).toHaveAttribute('href', `/en/circles/p/${theirs}#comments`)

      // Fifty a day.
      const spare = await addPost('A spare post', 'en')
      await member.query(`insert into circle_comments (post_id, user_id, body, lang) select $1, $2, 'Comment ' || n, 'en' from generate_series(1, 50) n`, [spare, member.id])
      await page.goto(`/en/circles/p/${theirs}`)
      await box.fill('One too many')
      await form.getByRole('button', { name: c.publish, exact: true }).click()
      await expect(form.getByRole('alert')).toHaveText(c.errors.commentDailyLimit.replace('{limit}', '50'))

      // What the export says about it.
      const exported = await (await page.request.get('/api/account/export?locale=en')).json()
      expect(exported.circleComments.find((row: { text: string }) => row.text === 'Yes please!')).toMatchObject({ post: theirs, reply: true, status: 'shown' })
      expect(exported.circleCommentReports).toMatchObject([{ comment: thanks, post: theirs, reason: 'offTopic', resolvedAt: null }])

      // Hidden by the site owner: gone for others with the replies under it, still there for its author.
      await member.query(`update circle_comments set status = 'hidden' where id = $1`, [thanks])
      await page.reload()
      await expect(section.getByText('Thanks! The palette')).toHaveCount(0)
      await expect(section.getByText('Yes please!')).toHaveCount(0)
      await expect(section.getByRole('heading', { name: 'Comments' })).toBeVisible()
      await expect(section.getByText(c.commentsEmpty)).toBeVisible()
      await context.clearCookies()
      await context.addCookies([other.cookie])
      await page.reload()
      const hiddenThread = section.getByRole('listitem').filter({ hasText: 'Thanks! The palette' }).first()
      await expect(hiddenThread.getByText(c.commentHiddenNote)).toBeVisible()
      // Nobody else sees what is under it, so nothing there can be answered.
      await expect(hiddenThread.getByText('Yes please!')).toBeVisible()
      await expect(hiddenThread.getByRole('button', { name: /^Reply to / })).toHaveCount(0)

      // A hidden post opens for its author alone, out of search and without comments; a deleted one for nobody.
      await member.query(`update circle_posts set status = 'hidden' where id = $1`, [theirs])
      await page.reload()
      await expect(page.getByRole('article').getByText(c.hiddenNote)).toBeVisible()
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      await expect(page.locator('#comments')).toHaveCount(0)
      await context.clearCookies()
      await context.addCookies([member.cookie])
      expect((await page.goto(`/en/circles/p/${theirs}`))?.status()).toBe(404)
      await member.query(`delete from circle_posts where id = $1`, [theirs])
      await context.clearCookies()
      await context.addCookies([other.cookie])
      expect((await page.goto(`/en/circles/p/${theirs}`))?.status()).toBe(404)
    } finally {
      await member.remove()
      await other.remove()
    }
  })

  test('a post links to an app and a Skill on IFAI with cards', async ({ page, baseURL }) => {
    test.skip(
      !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET || !process.env.E2E_SAMPLE_APPS || !process.env.E2E_SAMPLE_SKILLS,
      'Run scripts/seed-apps.ts and scripts/seed-skills.ts and set E2E_SAMPLE_APPS and E2E_SAMPLE_SKILLS.',
    )
    const site = baseURL ?? 'http://localhost:3000'
    const member = await createMember(site, 'Ada Links')
    try {
      const aiArt = (await member.query<{ id: number }>(`select id from circles where slug = 'ai-art'`)).rows[0].id
      const body = `Two I use: ${site}/zh-hans/apps/lumen-chat and ${site}/resources/skills/sample-release-notes/v/1.0.0, plus ${site}/apps/lumen-chat again and ${site}/apps/draft-demo.`
      const id = (
        await member.query<{ id: number }>(`insert into circle_posts (circle_id, user_id, body, lang) values ($1, $2, $3, 'en') returning id`, [aiArt, member.id, body])
      ).rows[0].id
      await page.goto(`/en/circles/p/${id}`)
      const post = page.getByRole('article')
      const cards = post.getByRole('link', { name: /^(App|Skill) · / })
      await expect(cards).toHaveCount(2)
      await expect(cards.nth(0)).toHaveAttribute('href', '/en/apps/lumen-chat')
      await expect(cards.nth(0)).toContainText('App · Lumen Chat')
      await expect(cards.nth(1)).toHaveAttribute('href', '/en/resources/skills/sample-release-notes')
      await expect(cards.nth(1)).toContainText(/installs · IFAI Samples/)
      // A draft gets no card; its address is still a link.
      await expect(post.getByRole('link', { name: `${site}/apps/draft-demo` })).toBeVisible()
    } finally {
      await member.remove()
    }
  })
})

/** A plain picture, as a phone would save it: a JPEG, or PNG when asked. */
function picture(color: string, { width = 640, height = 480, png = false } = {}) {
  const image = sharp({ create: { width, height, channels: 3, background: color } })
  return (png ? image.png() : image.jpeg()).toBuffer()
}

/** The sign-in dialog opens, titled for what the visitor pressed, and closes again. */
async function expectSignIn(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}
