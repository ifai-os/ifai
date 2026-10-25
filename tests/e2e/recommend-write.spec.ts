import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import type enMessages from '../../messages/en.json'

import { createMember } from './member'

const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as typeof enMessages
const w = en.recommend.write
const nowhere = 2_000_000_000

/** The recommend module opens in phase two (NEXT_PUBLIC_SITE_PHASE ≥ 2, as CI builds). */
const launched = Number(process.env.NEXT_PUBLIC_SITE_PHASE ?? '1') >= 2

/** A 2 × 2 PNG, as a member's picture. */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)

async function pick(page: Page, button: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button }).click()
  await (await chooser).setFiles({ name: 'chart.png', mimeType: 'image/png', buffer: png })
}

test.describe('readers writing articles', () => {
  test.skip(!launched, 'The recommend module opens in phase two: build with NEXT_PUBLIC_SITE_PHASE=2, as CI does.')

  test('only members write, from IFAI’s own pages', async ({ page, request }) => {
    const article = { title: 'Hello', channel: 'agents', markdown: 'Words', publish: true, locale: 'en' }
    expect((await request.post('/api/recommend/articles', { data: article })).status()).toBe(401)
    expect((await request.post('/api/recommend/articles', { data: { ...article, channel: 'news' } })).status()).toBe(400)
    expect((await request.post('/api/recommend/articles', { data: article, headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403)
    expect((await request.delete('/api/recommend/articles?id=1')).status()).toBe(401)
    expect((await request.post('/api/recommend/preview', { data: { markdown: 'x', locale: 'en' } })).status()).toBe(401)
    expect((await request.post('/api/recommend/images', { multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: png } } })).status()).toBe(401)
    expect((await request.post('/api/recommend/report', { data: { article: 1, reason: 'boring' } })).status()).toBe(400)
    expect((await request.post('/api/recommend/report', { data: { article: nowhere, reason: 'spam' } })).status()).toBe(404)

    for (const [path, prompt] of [
      ['/en/recommend/write', w.signInBody],
      ['/en/me/articles', en.recommend.mine.signInBody],
    ]) {
      await page.goto(path)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      await expect(page.getByText(prompt)).toBeVisible()
    }
  })

  test('a member writes with a picture, previews, publishes, and a reader reports it', async ({ page, browser, baseURL }) => {
    const member = await createMember(baseURL!, 'Ada Writer')
    try {
      await page.context().addCookies([member.cookie])
      await page.goto('/en/recommend')
      await page.getByRole('link', { name: en.header.write }).click()
      await expect(page.getByRole('heading', { level: 1, name: w.newTitle })).toBeVisible()

      await page.getByLabel(w.title).fill('What I learned wiring RAG into an agent')
      await page.getByLabel(w.channel).selectOption('agents')
      await page.getByLabel(w.tags).fill('RAG, Agents')
      await page.getByLabel(w.body).fill('# Start small\n\nRead [the docs](https://example.com/docs) first.\n\n```py\nprint("hi")\n```\n')
      await pick(page, w.insertImage)
      await expect(page.getByLabel(w.body)).toHaveValue(/!\[\]\(\/api\/article-images\/file\/[^)]+\)/)

      await page.getByRole('tab', { name: w.preview }).click()
      const preview = page.locator('[aria-live="polite"]')
      await expect(preview.getByRole('heading', { level: 2, name: 'Start small' })).toBeVisible()
      await expect(preview.getByRole('link', { name: 'the docs' })).toHaveAttribute('rel', /ugc/)
      await expect(preview.locator('img')).toHaveCount(1)

      // A draft is the member's alone, its picture too.
      await page.getByRole('button', { name: w.saveDraft }).click()
      await expect(page.getByText(w.saved)).toBeVisible()
      await expect(page).toHaveURL(/\/en\/recommend\/write\/\d+$/)
      const id = Number(page.url().split('/').pop())
      await page.getByRole('tab', { name: w.write }).click()
      const picture = /\((\/api\/article-images\/file\/[^)]+)\)/.exec(await page.getByLabel(w.body).inputValue())![1]
      const stranger = await browser.newContext()
      expect((await stranger.request.get(picture)).status()).toBeGreaterThanOrEqual(400)
      expect((await page.request.get(picture)).status()).toBe(200)
      expect((await stranger.request.get(`/en/recommend/${id}`)).status()).toBe(404)

      await page.goto('/en/me/articles')
      const row = page.getByRole('listitem').filter({ hasText: 'What I learned wiring RAG' })
      await expect(row.getByText(en.recommend.mine.status.draft)).toBeVisible()
      await row.getByRole('link', { name: en.recommend.mine.edit }).click()

      await page.getByRole('button', { name: w.publish }).click()
      await expect(page).toHaveURL(new RegExp(`/en/recommend/${id}$`))
      await expect(page.getByRole('heading', { level: 1, name: 'What I learned wiring RAG into an agent' })).toBeVisible()
      await expect(page.getByText('Ada Writer')).toBeVisible()
      const article = page.locator('article').first()
      await expect(article.getByRole('heading', { level: 2, name: 'Start small' })).toBeVisible()
      await expect(article.getByRole('link', { name: 'the docs' })).toHaveAttribute('rel', /nofollow ugc/)
      await expect(article.locator(`figure img[src*="${picture.split('/').pop()}"]`)).toHaveCount(1)
      expect((await stranger.request.get(picture)).status()).toBe(200)

      // The author cannot report their own; a visitor can, once.
      await page.getByRole('button', { name: en.recommend.report.open }).click()
      await page.getByRole('radio', { name: en.recommend.report.reasons.spam }).check()
      await page.getByRole('dialog').getByRole('button', { name: en.recommend.report.send }).click()
      await expect(page.getByRole('dialog').getByRole('status')).toHaveText(en.recommend.report.own)

      const reader = await stranger.newPage()
      await reader.goto(`/en/recommend/${id}`)
      await reader.getByRole('button', { name: en.recommend.report.open }).click()
      await reader.getByRole('radio', { name: en.recommend.report.reasons.offTopic }).check()
      await reader.getByRole('dialog').getByRole('button', { name: en.recommend.report.send }).click()
      await expect(reader.getByRole('dialog').getByRole('status')).toHaveText(en.recommend.report.done)
      const { rows } = await member.query<{ reason: string }>('select reason from article_reports where article_id = $1', [id])
      expect(rows).toEqual([{ reason: 'offTopic' }])

      // Deleting takes the article and its picture.
      await page.goto('/en/me/articles')
      await page.getByRole('button', { name: en.recommend.mine.delete }).click()
      await page.getByRole('group').getByRole('button', { name: en.recommend.mine.deleteYes }).click()
      await expect(page.getByText(en.recommend.mine.emptyTitle)).toBeVisible()
      expect((await stranger.request.get(`/en/recommend/${id}`)).status()).toBe(404)
      expect((await stranger.request.get(picture)).status()).toBeGreaterThanOrEqual(400)
      await stranger.close()
    } finally {
      await member.remove()
    }
  })

  test('pictures from elsewhere are turned down', async ({ page, baseURL }) => {
    const member = await createMember(baseURL!)
    try {
      await page.context().addCookies([member.cookie])
      await page.goto('/en/recommend/write')
      await page.getByLabel(w.title).fill('Borrowed picture')
      await page.getByLabel(w.channel).selectOption('images')
      await page.getByLabel(w.body).fill('![cat](https://example.com/cat.png)')
      await page.getByRole('button', { name: w.publish }).click()
      await expect(page.getByText(w.errors['image-source'])).toBeVisible()
      await expect(page.getByLabel(w.body)).toHaveAttribute('aria-invalid', 'true')
    } finally {
      await member.remove()
    }
  })
})
