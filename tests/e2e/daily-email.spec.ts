import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { resolveMx } from 'node:dns/promises'
import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'
import pg from 'pg'

import type enMessages from '../../messages/en.json'
import { subscriberToken } from '../../src/modules/daily/email/token'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')
const languages = ['en', 'zh-hans', 'zh-hant', 'ja', 'ko'] as const

/**
 * Each test is its own visitor (a random documentation address, as the proxy in front of the
 * site would report it), so the ten-an-hour limit of one test never stops another.
 */
const visitor = () => ({ 'x-forwarded-for': `2001:db8:${randomBytes(6).toString('hex').match(/.{4}/g)?.join(':')}::1` })
const address = () => `e2e-${randomUUID()}@gmail.com`

async function asVisitor(page: Page) {
  await page.setExtraHTTPHeaders(visitor())
}

// The server needs DAILY_EMAIL_ENABLED=true (CI sets it); without Resend the emails go to its log.
test.describe('daily email subscription', () => {
  test.skip(process.env.DAILY_EMAIL_ENABLED !== 'true', 'Start the server with DAILY_EMAIL_ENABLED=true.')

  test('the box is on the daily list, the home page and phones, in every language', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const lang of languages) {
      const messages = load(lang)
      await page.goto(`/${lang}/daily`)
      await expect(page.getByRole('heading', { level: 2, name: messages.subscribe.title }), lang).toBeVisible()
      await expect(page.getByRole('button', { name: messages.subscribe.submit, exact: true })).toBeVisible()
    }
    await page.goto('/en')
    await expect(page.getByRole('heading', { level: 2, name: en.subscribe.title })).toBeVisible()

    await page.setViewportSize({ width: 375, height: 800 })
    for (const path of ['/zh-hans/daily', '/zh-hans']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 2, name: load('zh-hans').subscribe.title }), path).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })

  test('a malformed address is refused and a mistyped provider is fixed with one click', async ({ page }) => {
    await asVisitor(page)
    await page.goto('/en/daily')
    const box = page.getByRole('region', { name: en.subscribe.title })
    const input = box.getByRole('textbox', { name: en.subscribe.email })
    const submit = box.getByRole('button', { name: en.subscribe.submit, exact: true })

    await input.fill('not-an-address')
    await submit.click()
    await expect(box.getByRole('alert')).toHaveText(en.subscribe.invalid)
    await expect(input).toHaveAttribute('aria-invalid', 'true')

    await input.fill('reader@gmial.com')
    await submit.click()
    await expect(box.getByRole('alert')).toHaveText('Did you mean gmail.com?')
    await box.getByRole('button', { name: 'gmail.com' }).click()
    await expect(input).toHaveValue('reader@gmail.com')
    await expect(box.getByRole('alert')).toHaveCount(0)
  })

  test('the API refuses addresses that cannot receive mail', async ({ request }) => {
    const headers = visitor()
    const bad = await request.post('/api/subscriptions', { headers, data: { email: 'reader@', locale: 'en' } })
    expect(bad.status()).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid-email' })

    // Needs working DNS where the tests run, to know the server's answer is a real one.
    const dns = await resolveMx('gmail.com').then(
      (records) => records.length > 0,
      () => false,
    )
    test.skip(!dns, 'No DNS here.')
    const nowhere = await request.post('/api/subscriptions', { headers, data: { email: `reader@${randomUUID()}.invalid`, locale: 'en' } })
    expect(nowhere.status()).toBe(400)
  })

  test('ten tries an hour per visitor', async ({ request }) => {
    const headers = visitor()
    for (let i = 0; i < 10; i++) {
      expect((await request.post('/api/subscriptions', { headers, data: { email: 'not-an-address' } })).status()).toBe(400)
    }
    const blocked = await request.post('/api/subscriptions', { headers, data: { email: 'not-an-address' } })
    expect(blocked.status()).toBe(429)
  })

  test('the API answers only IFAI’s own pages', async ({ request }) => {
    const response = await request.post('/api/subscriptions', {
      headers: { ...visitor(), 'sec-fetch-site': 'cross-site' },
      data: { email: address() },
    })
    expect(response.status()).toBe(403)
  })
})

// These read and write the subscribers table: they need the server's DATABASE_URI and PAYLOAD_SECRET (CI sets both).
test.describe('daily email subscription, with the database', () => {
  test.skip(
    process.env.DAILY_EMAIL_ENABLED !== 'true' || !process.env.DATABASE_URI || !process.env.PAYLOAD_SECRET,
    'Needs DAILY_EMAIL_ENABLED=true, DATABASE_URI and PAYLOAD_SECRET, the same as the server.',
  )

  let db: pg.Client
  const created: string[] = []

  test.beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env.DATABASE_URI })
    await db.connect()
  })

  test.afterAll(async () => {
    if (created.length) {
      await db.query('delete from email_sends where subscriber_id in (select id from subscribers where email = any($1))', [created])
      await db.query('delete from subscribers where email = any($1)', [created])
    }
    await db.end()
  })

  type Row = { id: number; locale: string; time_zone: string; status: string; stop_reason: string | null; source_page: string | null; welcome_sent_at: Date | null }

  async function row(email: string): Promise<Row | null> {
    const { rows } = await db.query<Row>('select * from subscribers where email = $1', [email])
    return rows[0] ?? null
  }

  async function insert(fields: { status?: string; stopReason?: string; locale?: string } = {}) {
    const email = address()
    created.push(email)
    const { rows } = await db.query<{ id: number }>(
      `insert into subscribers (email, locale, time_zone, status, stop_reason, subscribed_at)
       values ($1, $2, 'America/Los_Angeles', $3, $4, now()) returning id`,
      [email, fields.locale ?? 'en', fields.status ?? 'subscribed', fields.stopReason ?? null],
    )
    const id = rows[0].id
    return { email, id, token: subscriberToken(id, process.env.PAYLOAD_SECRET ?? '') }
  }

  test('subscribing says so at once, welcomes the reader, and says the same to a repeat', async ({ page, request }) => {
    const email = address()
    created.push(email)
    await asVisitor(page)
    await page.goto('/en/daily')
    const box = page.getByRole('region', { name: en.subscribe.title })
    await box.getByRole('textbox', { name: en.subscribe.email }).fill(email)
    await box.getByRole('button', { name: en.subscribe.submit, exact: true }).click()
    await expect(box.getByRole('status')).toHaveText(en.subscribe.done)

    await expect.poll(async () => (await row(email))?.welcome_sent_at ?? null).not.toBeNull()
    const first = await row(email)
    expect(first).toMatchObject({ locale: 'en', status: 'subscribed', source_page: '/en/daily' })

    // The same address again: the same answer, no second welcome, no change to its settings.
    const again = await request.post('/api/subscriptions', { headers: visitor(), data: { email, locale: 'ja', timeZone: 'Asia/Tokyo' } })
    expect(again.status()).toBe(200)
    expect(await again.json()).toEqual({ ok: true })
    const after = await row(email)
    expect(after).toMatchObject({ locale: 'en', time_zone: first?.time_zone, welcome_sent_at: first?.welcome_sent_at })
  })

  test('a robot that fills the hidden field is told yes and nothing happens', async ({ request }) => {
    const email = address()
    const response = await request.post('/api/subscriptions', { headers: visitor(), data: { email, website: 'https://spam.example' } })
    expect(response.status()).toBe(200)
    expect(await row(email)).toBeNull()
  })

  test('a complaint is not undone from the box, only from the manage page', async ({ page, request }) => {
    const { email, token } = await insert({ status: 'stopped', stopReason: 'complaint' })
    const response = await request.post('/api/subscriptions', { headers: visitor(), data: { email } })
    expect(await response.json()).toEqual({ ok: true })
    expect((await row(email))?.status).toBe('stopped')

    await page.goto(`/en/daily/subscription?token=${token}`)
    await expect(page.getByText(en.subscription.stopped.complaint)).toBeVisible()
    await page.getByRole('button', { name: en.subscription.resubscribe }).click()
    await expect(page.getByText(en.subscription.resubscribed)).toBeVisible()
    expect(await row(email)).toMatchObject({ status: 'subscribed', stop_reason: null })
  })

  test('the manage page changes language and time zone, unsubscribes and subscribes again', async ({ page }) => {
    const { email, token } = await insert()
    await page.goto(`/en/daily/subscription?token=${token}`)
    await expect(page.getByRole('heading', { level: 1, name: en.subscription.title })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    await expect(page.getByText(email.replace(/^(..)[^@]*/, '$1•••'))).toBeVisible()
    await expect(page.getByText(en.subscription.status.subscribed, { exact: true })).toBeVisible()
    await expect(page.getByText(/^Next email: .+ at 8:00\sAM \(Pacific Time\)$/)).toBeVisible()

    // In the page, not the header's language switcher.
    const main = page.getByRole('main')
    await main.getByLabel(en.subscription.language).selectOption('ja')
    await main.getByLabel(en.subscription.timeZone).selectOption('Asia/Tokyo')
    await page.getByRole('button', { name: en.subscription.save }).click()
    await expect(page.getByText(en.subscription.saved, { exact: true })).toBeVisible()
    expect(await row(email)).toMatchObject({ locale: 'ja', time_zone: 'Asia/Tokyo' })
    await expect(page.getByText(/\(Japan Standard Time\)$/)).toBeVisible()

    await page.getByRole('button', { name: en.subscription.unsubscribe }).click()
    await expect(page.getByText(en.subscription.unsubscribed)).toBeVisible()
    expect((await row(email))?.status).toBe('unsubscribed')

    await page.getByRole('button', { name: en.subscription.resubscribe }).click()
    await expect(page.getByText(en.subscription.resubscribed)).toBeVisible()
    expect((await row(email))?.status).toBe('subscribed')
  })

  test('「退订」in an email unsubscribes as the page opens', async ({ page }) => {
    const { email, token } = await insert({ locale: 'ja' })
    const ja = load('ja')
    await page.goto(`/ja/daily/subscription?token=${token}&unsubscribe=1`)
    await expect(page.getByText(ja.subscription.unsubscribed)).toBeVisible()
    expect((await row(email))?.status).toBe('unsubscribed')
    await expect(page.getByRole('button', { name: ja.subscription.resubscribe })).toBeVisible()
  })

  test('mail clients’ one-click unsubscribe', async ({ request }) => {
    const { email, token } = await insert({ locale: 'ko' })
    const opened = await request.get(`/api/subscriptions/unsubscribe?token=${token}`, { maxRedirects: 0 })
    expect(opened.status()).toBe(303)
    expect(opened.headers().location).toContain(`/ko/daily/subscription?token=${encodeURIComponent(token)}&unsubscribe=1`)
    expect((await row(email))?.status).toBe('subscribed')

    const response = await request.post(`/api/subscriptions/unsubscribe?token=${token}`, { form: { 'List-Unsubscribe': 'One-Click' } })
    expect(response.status()).toBe(200)
    expect(await response.text()).toBe('')
    expect((await row(email))?.status).toBe('unsubscribed')

    const forged = `${token.split('.')[0]}.${'A'.repeat(32)}`
    const wrong = await request.post(`/api/subscriptions/unsubscribe?token=${forged}`, { form: { 'List-Unsubscribe': 'One-Click' } })
    expect(wrong.status()).toBe(404)
  })

  test('a wrong link says so and offers the box', async ({ page }) => {
    await page.goto('/en/daily/subscription?token=1.not-a-signature')
    await expect(page.getByRole('heading', { level: 1, name: en.subscription.invalidTitle })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: en.subscribe.title })).toBeVisible()
  })

  test('the back office’s numbers, preview and test email are for admins only', async ({ request }) => {
    expect((await request.get('/api/subscribers/overview')).status()).toBe(401)
    expect((await request.get('/api/subscribers/preview?locale=ja')).status()).toBe(401)
    expect((await request.post('/api/subscribers/test-email', { data: { locale: 'ja' } })).status()).toBe(401)
  })

  // Resend's delivery webhooks, signed the way Svix signs them with the server's RESEND_WEBHOOK_SECRET (CI sets a placeholder).
  const webhook = (event: object, id = `msg_${randomUUID()}`) => {
    const body = JSON.stringify(event)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const key = Buffer.from((process.env.RESEND_WEBHOOK_SECRET ?? '').replace(/^whsec_/, ''), 'base64')
    const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
    return {
      data: body,
      headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
    }
  }
  // The server runs outside Vercel: its emails carry env "development".
  const emailEvent = (type: string, to: string, tags: Record<string, string>, data: object = {}) => ({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: `e2e-${randomUUID()}`, to: [to], created_at: new Date().toISOString(), tags: { env: 'development', ...tags }, ...data },
  })

  test('the webhook takes only requests Resend signed', async ({ request }) => {
    test.skip(!process.env.RESEND_WEBHOOK_SECRET, 'Needs RESEND_WEBHOOK_SECRET, the same as the server.')
    const signed = webhook({ type: 'email.delivered', data: {} })
    expect((await request.post('/api/subscriptions/webhook', { data: signed.data, headers: { 'content-type': 'application/json' } })).status()).toBe(401)
    expect((await request.post('/api/subscriptions/webhook', { data: `${signed.data} `, headers: signed.headers })).status()).toBe(401)
    const late = { ...signed.headers, 'svix-timestamp': String(Math.floor(Date.now() / 1000) - 600) }
    expect((await request.post('/api/subscriptions/webhook', { data: signed.data, headers: late })).status()).toBe(401)
    expect((await request.post('/api/subscriptions/webhook', signed)).status()).toBe(200)
  })

  test('a bounced welcome email stops the address, once, and only this deployment’s', async ({ request }) => {
    test.skip(!process.env.RESEND_WEBHOOK_SECRET, 'Needs RESEND_WEBHOOK_SECRET, the same as the server.')
    const { email, id } = await insert()
    const bounced = (env?: string) =>
      emailEvent('email.bounced', email, { kind: 'daily_welcome', subscriber: String(id), ...(env && { env }) }, { bounce: { type: 'Permanent', message: 'No such user' } })

    const elsewhere = await request.post('/api/subscriptions/webhook', webhook(bounced('production')))
    expect(await elsewhere.json()).toEqual({ result: 'ignored' })
    expect((await row(email))?.status).toBe('subscribed')

    const signed = webhook(bounced())
    expect(await (await request.post('/api/subscriptions/webhook', signed)).json()).toEqual({ result: 'applied' })
    expect(await row(email)).toMatchObject({ status: 'stopped', stop_reason: 'bounce' })
    // Resend delivering the same event again.
    expect(await (await request.post('/api/subscriptions/webhook', signed)).json()).toEqual({ result: 'duplicate' })
  })

  test('a delivered morning email moves its row forward, never back', async ({ request }) => {
    test.skip(!process.env.RESEND_WEBHOOK_SECRET, 'Needs RESEND_WEBHOOK_SECRET, the same as the server.')
    const { email, id } = await insert()
    const { rows } = await db.query<{ id: number }>(
      `insert into email_sends (subscriber_id, local_date, locale, status, story_count, sent_at) values ($1, current_date, 'en', 'sent', 3, now()) returning id`,
      [id],
    )
    const tags = { kind: 'daily', subscriber: String(id), send: String(rows[0].id) }
    const send = async () => (await db.query<{ status: string; resend_id: string | null }>('select status, resend_id from email_sends where id = $1', [rows[0].id])).rows[0]

    const delivered = emailEvent('email.delivered', email, tags)
    expect(await (await request.post('/api/subscriptions/webhook', webhook(delivered))).json()).toEqual({ result: 'applied' })
    expect(await send()).toEqual({ status: 'delivered', resend_id: delivered.data.email_id })
    await request.post('/api/subscriptions/webhook', webhook({ ...delivered, type: 'email.sent' }))
    expect((await send()).status).toBe('delivered')
    expect((await row(email))?.status).toBe('subscribed')
  })
})
