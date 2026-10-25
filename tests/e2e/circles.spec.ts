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
