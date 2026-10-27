import { createHmac } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { locales, type Locale } from '@/i18n/config'
import { DIGEST_MAX, pickDigest, type DigestStory } from '@/modules/daily/email/content'
import { deploymentEnv, failureKind, readQuota, ResendError, sendBatch, type OutgoingEmail } from '@/modules/daily/email/delivery'
import { buildDigestEmail, digestDate } from '@/modules/daily/email/digest'
import { quotaView, upgradeDue } from '@/modules/daily/email/overview'
import { dueDay, wallTime } from '@/modules/daily/email/schedule'
import { chunks, claimable, MAX_ATTEMPTS } from '@/modules/daily/email/send'
import { subscriberToken } from '@/modules/daily/email/token'
import { planEvent, readDeliveryEvent, stopApplies, stopReasonAfter, verifyWebhook, type DeliveryEvent } from '@/modules/daily/email/webhook'
import type { RawStory } from '@/modules/daily/public/story-item'

const QUARTER = 15 * 60 * 1000

/** Every run of the job (minutes 0, 15, 30 and 45 UTC) between two instants. */
function runs(from: string, to: string): Date[] {
  const result: Date[] = []
  for (let at = Date.parse(from); at < Date.parse(to); at += QUARTER) result.push(new Date(at))
  return result
}

/** The runs that find the zone due, grouped by the local date they are for. */
function dueRuns(timeZone: string, from: string, to: string): Map<string, Date[]> {
  const byDate = new Map<string, Date[]>()
  for (const at of runs(from, to)) {
    const day = dueDay(timeZone, at)
    if (day) byDate.set(day.localDate, [...(byDate.get(day.localDate) ?? []), at])
  }
  return byDate
}

const clock = (at: Date, timeZone: string) => {
  const wall = wallTime(at, timeZone)
  return `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`
}

/** 8:00, 8:15 … 10:45 on the subscriber's clock: the runs that may send their email. */
const morning = Array.from({ length: 12 }, (_, index) => `${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`)

describe('who is due in a run', () => {
  it('opens at 8:00 local time and closes at 11:00, whole-hour, half-hour and 45-minute zones alike', () => {
    for (const timeZone of ['Asia/Tokyo', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Kathmandu', 'Pacific/Chatham', 'UTC']) {
      const days = dueRuns(timeZone, '2026-10-21T00:00:00Z', '2026-10-26T00:00:00Z')
      // 23 and 24 October lie wholly inside these runs in every zone: twelve chances each, from 8:00 sharp.
      for (const date of ['2026-10-23', '2026-10-24']) {
        expect(days.get(date)?.map((at) => clock(at, timeZone)), `${timeZone} ${date}`).toEqual(morning)
      }
      for (const at of [...days.values()].flat()) expect(morning, timeZone).toContain(clock(at, timeZone))
    }
  })

  it('stays at 8:00 across daylight saving changes', () => {
    // Los Angeles falls back on 1 November 2026 and springs forward on 14 March 2027; London falls back on 25 October 2026.
    for (const [timeZone, from, to, dates] of [
      ['America/Los_Angeles', '2026-10-30T00:00:00Z', '2026-11-04T00:00:00Z', ['2026-10-31', '2026-11-01', '2026-11-02']],
      ['America/Los_Angeles', '2027-03-12T00:00:00Z', '2027-03-17T00:00:00Z', ['2027-03-13', '2027-03-14', '2027-03-15']],
      ['Europe/London', '2026-10-23T00:00:00Z', '2026-10-28T00:00:00Z', ['2026-10-24', '2026-10-25', '2026-10-26']],
    ] as const) {
      const days = dueRuns(timeZone, from, to)
      for (const date of dates) expect(days.get(date)?.map((at) => clock(at, timeZone)), `${timeZone} ${date}`).toEqual(morning)
    }
    expect(dueDay('America/Los_Angeles', new Date('2026-11-01T16:00:00Z'))).toEqual({
      localDate: '2026-11-01',
      sendAt: new Date('2026-11-01T16:00:00Z'),
    })
    expect(dueDay('America/Los_Angeles', new Date('2026-10-31T15:00:00Z'))?.sendAt).toEqual(new Date('2026-10-31T15:00:00Z'))
  })

  it('gives each zone its own date: Kiritimati is a day ahead of Honolulu on the same clock', () => {
    const at = new Date('2026-10-23T18:00:00Z')
    expect(dueDay('Pacific/Kiritimati', at)?.localDate).toBe('2026-10-24')
    expect(dueDay('Pacific/Honolulu', at)?.localDate).toBe('2026-10-23')
    expect(dueDay('Asia/Tokyo', at)).toBeNull()
  })

  it('takes a row again only after a failure with tries left, or when its own run retries it', () => {
    const now = new Date('2026-10-23T00:00:00Z')
    const row = { status: 'failed', attempts: 1, runId: 'run-a', updatedAt: new Date(now.getTime() - 60_000) } as const
    expect(claimable(row, 'run-b', now)).toBe(true)
    expect(claimable({ ...row, attempts: MAX_ATTEMPTS }, 'run-b', now)).toBe(false)
    expect(claimable({ ...row, status: 'sending' }, 'run-a', now)).toBe(true)
    expect(claimable({ ...row, status: 'sending' }, 'run-b', now)).toBe(false)
    expect(claimable({ ...row, status: 'sending', updatedAt: new Date(now.getTime() - 2 * 3_600_000) }, 'run-b', now)).toBe(true)
    for (const status of ['sent', 'delivered', 'bounced', 'complained'] as const) expect(claimable({ ...row, status }, 'run-a', now)).toBe(false)
  })

  it('splits the claimed rows into batches of the size Resend takes', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunks([], 100)).toEqual([])
  })
})

const raw = (id: number, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    slug: `story-${id}`,
    category: 'tools',
    title: { en: `Story ${id}`, 'zh-Hans': `新闻 ${id}`, 'zh-Hant': `新聞 ${id}` },
    summary: { en: `Summary ${id}.`, 'zh-Hans': `摘要 ${id}。` },
    sources: [{ name: `Source ${id}`, role: 'original', url: `https://source.example/${id}` }],
    eventId: id,
    heat: 50,
    score: 70,
    publishedAt: '2026-10-23T02:00:00.000Z',
    createdAt: '2026-10-23T01:00:00.000Z',
    ...overrides,
  }) as unknown as RawStory

describe('what the morning email carries', () => {
  it('takes one story per event, by heat, then AI score, then the newer, ten at most', () => {
    const stories = [
      raw(1, { heat: 40 }),
      raw(2, { heat: 90 }),
      raw(3, { heat: 90, eventId: 2, score: 60 }),
      raw(4, { heat: 70, score: 90 }),
      raw(5, { heat: 70, score: 80 }),
      raw(6, { heat: 70, score: 80, publishedAt: '2026-10-23T05:00:00.000Z' }),
      ...Array.from({ length: 10 }, (_, index) => raw(20 + index, { heat: 30 - index })),
    ]
    const picked = pickDigest(stories)
    expect(picked).toHaveLength(DIGEST_MAX)
    expect(picked.slice(0, 5).map((story) => story.id)).toEqual([2, 4, 6, 5, 1])
    expect(picked.map((story) => story.id)).not.toContain(3)
  })

  it('has no limit per source, unlike the poster', () => {
    const picked = pickDigest([1, 2, 3, 4].map((id) => raw(id, { sources: [{ name: 'OpenAI', role: 'original', url: 'https://openai.com' }] })))
    // All else equal, the later story first.
    expect(picked.map((story) => story.id)).toEqual([4, 3, 2, 1])
    expect(picked[0]).toMatchObject({ source: 'OpenAI', title: { ja: { value: 'Story 4', lang: 'en' } }, summary: { ja: { value: 'Summary 4.', lang: 'en' } } })
  })
})

function digestStory(id: number, overrides: Partial<DigestStory> = {}): DigestStory {
  const title = Object.fromEntries(locales.map((locale) => [locale, { value: `Story ${id} in ${locale}`, lang: locale }])) as DigestStory['title']
  const summary = Object.fromEntries(locales.map((locale) => [locale, { value: `Summary ${id} in ${locale}.`, lang: locale }])) as DigestStory['summary']
  return { id, slug: `story-${id}`, category: 'research', source: `Lab ${id}`, publishedAt: '2026-10-23T02:00:00.000Z', title, summary, ...overrides }
}

describe('the morning email', () => {
  beforeEach(() => {
    vi.stubEnv('PAYLOAD_SECRET', 'test-secret')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ifai.example')
    vi.stubEnv('DAILY_EMAIL_FROM', 'news@ifai.io')
  })
  afterEach(() => vi.unstubAllEnvs())

  const ten = Array.from({ length: 10 }, (_, index) => digestStory(index + 1))
  const reader = (locale: Locale) => ({ email: 'reader@gmail.com', locale, subscriberId: 7, sendId: 41 })

  it('names the top story and how many there are, in the subscriber’s language', async () => {
    const zh = await buildDigestEmail(reader('zh-Hans'), '2026-10-24', ten)
    expect(zh.subject).toBe('Story 1 in zh-Hans 等 10 件 AI 大事')
    expect(zh.senderName).toBe('IFAI 日报')
    expect(zh.text).toContain('10月24日星期六')
    expect(zh.text).toContain('过去 24 小时 · 10 件大事')

    const en = await buildDigestEmail(reader('en'), '2026-10-24', ten)
    expect(en.subject).toBe('Story 1 in en + 9 more AI stories')
    expect(en.html).toContain('Saturday, October 24')
    // The inbox line after the subject: the second and third titles.
    expect(en.html).toContain('Story 2 in en · Story 3 in en</div>')

    const single = await buildDigestEmail(reader('ko'), '2026-10-24', ten.slice(0, 1))
    expect(single.subject).toBe('Story 1 in ko')
    expect(single.text).toContain('지난 24시간 · 뉴스 1건')
    expect((await buildDigestEmail(reader('ja'), '2026-10-24', ten.slice(0, 2))).subject).toBe('Story 1 in ja など 2 件の AI ニュース')
    expect((await buildDigestEmail(reader('en'), '2026-10-24', ten.slice(0, 2))).subject).toBe('Story 1 in en + 1 more AI story')
    expect(digestDate('2026-10-24', 'ja')).toBe('10月24日土曜日')
  })

  it('links every title to the story page in that language, plus the daily list, without tracking', async () => {
    const email = await buildDigestEmail(reader('ja'), '2026-10-24', ten)
    for (const story of ten) expect(email.html).toContain(`href="https://ifai.example/ja/news/${story.slug}"`)
    expect(email.html).toContain('href="https://ifai.example/ja/news"')
    expect(email.text).toContain('サイトですべて見る: https://ifai.example/ja/news')
    expect(email.html).toContain('研究 · Lab 2')
    expect(email.html).not.toMatch(/utm_|<script/i)
  })

  it('marks the text that falls back to English, and escapes what the stories say', async () => {
    const fallback = digestStory(1, {
      title: { ...digestStory(1).title, ko: { value: 'Acme <ships> "Model 2"', lang: 'en' } },
      summary: { ...digestStory(1).summary, ko: null },
    })
    const email = await buildDigestEmail(reader('ko'), '2026-10-24', [fallback])
    expect(email.html).toContain('<html lang="ko">')
    expect(email.html).toContain(' lang="en">Acme &lt;ships&gt; &quot;Model 2&quot;</a>')
    expect(email.html).not.toContain('<ships>')
    expect(email.text).not.toContain('Summary 1 in ko')
  })

  it('carries the reader’s signed links, the one-click headers and the ids for the webhooks', async () => {
    const email = await buildDigestEmail(reader('en'), '2026-10-24', ten)
    const token = subscriberToken(7, 'test-secret')
    expect(email.text).toContain(`https://ifai.example/en/news/subscription?token=${token}`)
    expect(email.headers).toEqual({
      'List-Unsubscribe': `<https://ifai.example/api/subscriptions/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(email).toMatchObject({ to: 'reader@gmail.com', kind: 'daily', tags: { subscriber: '7', send: '41' } })
  })

  it('goes to nobody’s subscription in a preview or a test email', async () => {
    const email = await buildDigestEmail({ email: 'owner@ifai.io', locale: 'zh-Hant', subscriberId: null }, '2026-10-24', ten)
    expect(email.kind).toBe('daily_test')
    expect(email.headers).toEqual({})
    expect(email.tags).toEqual({})
    expect(email.text).toContain('https://ifai.example/zh-hant/news/subscription\n')
    expect(email.text).not.toContain('token=')
  })

  it('stays under Gmail’s clipping size with ten long stories in every language, and is the same every time', async () => {
    const long = Array.from({ length: 10 }, (_, index) =>
      digestStory(index + 1, {
        title: Object.fromEntries(locales.map((locale) => [locale, { value: '标题'.repeat(30), lang: locale }])) as DigestStory['title'],
        summary: Object.fromEntries(locales.map((locale) => [locale, { value: '摘要内容'.repeat(60), lang: locale }])) as DigestStory['summary'],
      }),
    )
    for (const locale of locales) {
      const email = await buildDigestEmail(reader(locale), '2026-10-24', long)
      expect(Buffer.byteLength(email.html), locale).toBeLessThan(100 * 1024)
      expect(await buildDigestEmail(reader(locale), '2026-10-24', long)).toEqual(email)
    }
  })

  it('needs a story', async () => {
    await expect(buildDigestEmail(reader('en'), '2026-10-24', [])).rejects.toThrow()
  })
})

describe('Resend’s batch endpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const resend = { RESEND_API_KEY: 're_x', DAILY_EMAIL_FROM: 'news@ifai.io', VERCEL_ENV: 'production' }
  const email = (to: string): OutgoingEmail => ({
    to,
    senderName: 'IFAI Daily',
    subject: 'Story 1 + 9 more AI stories',
    html: '<p>hi</p>',
    text: 'hi',
    headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    kind: 'daily',
    tags: { subscriber: '7', send: '41' },
  })

  it('sends up to 100 with an idempotency key and gives the ids back in order', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ data: [{ id: 'a' }, { id: 'b' }] }, { headers: { 'x-resend-daily-quota': '12', 'x-resend-monthly-quota': '340' } }))
    const sent = await sendBatch([email('one@gmail.com'), email('two@gmail.com')], 'daily-email/run-1/1', resend)
    expect(sent).toEqual({ ids: ['a', 'b'], quota: { daily: 12, monthly: 340 } })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails/batch')
    expect(new Headers(init.headers).get('idempotency-key')).toBe('daily-email/run-1/1')
    const body = JSON.parse(String(init.body))
    expect(body).toHaveLength(2)
    expect(body[1]).toMatchObject({
      from: 'IFAI Daily <news@ifai.io>',
      to: ['two@gmail.com'],
      tags: [
        { name: 'kind', value: 'daily' },
        { name: 'env', value: 'production' },
        { name: 'subscriber', value: '7' },
        { name: 'send', value: '41' },
      ],
    })
    await expect(sendBatch(Array.from({ length: 101 }, () => email('x@gmail.com')), 'k', resend)).rejects.toThrow(/at most 100/)
  })

  it('says what kind of refusal it was', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json(
          { statusCode: 429, name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' },
          { status: 429, headers: { 'x-resend-daily-quota': '100' } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ name: 'rate_limit_exceeded', message: 'Too many requests.' }, { status: 429, headers: { 'retry-after': '2' } }),
      )
      .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await sendBatch([email('one@gmail.com')], 'k', resend).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ResendError)
    expect(error).toMatchObject({ kind: 'quota', status: 429, code: 'daily_quota_exceeded', quota: { daily: 100, monthly: null } })
    expect((error as Error).message).toBe('Resend responded 429 daily_quota_exceeded: You have reached your daily email sending quota.')
    expect(await sendBatch([email('one@gmail.com')], 'k', resend).catch((caught: unknown) => caught)).toMatchObject({ kind: 'busy', retryAfter: 2 })
    // A proxy's error page instead of Resend's JSON: tried again, with the page's words.
    expect(await sendBatch([email('one@gmail.com')], 'k', resend).catch((caught: unknown) => caught)).toMatchObject({
      kind: 'retry',
      message: 'Resend responded 502: <html>Bad gateway</html>',
    })

    expect(failureKind(429, 'monthly_quota_exceeded')).toBe('quota')
    expect(failureKind(409, 'invalid_idempotent_request')).toBe('conflict')
    expect(failureKind(409, 'concurrent_idempotent_requests')).toBe('busy')
    expect(failureKind(403, 'validation_error')).toBe('refused')
    expect(failureKind(401, 'missing_api_key')).toBe('refused')
    expect(failureKind(422, 'validation_error')).toBe('rejected')
    expect(failureKind(500, 'internal_server_error')).toBe('retry')
    expect(failureKind(502, '')).toBe('retry')
  })

  it('prints locally and refuses on Vercel without Resend', async () => {
    const print = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await sendBatch([email('one@gmail.com'), email('two@gmail.com')], 'k', {})).toEqual({ ids: [null, null], quota: null })
    expect(print).toHaveBeenCalledTimes(2)
    await expect(sendBatch([email('one@gmail.com')], 'k', { VERCEL_ENV: 'preview' })).rejects.toThrow(/DAILY_EMAIL_FROM/)
  })

  it('reads the quota headers and names the deployment', () => {
    expect(readQuota(new Headers({ 'x-resend-daily-quota': '3' }))).toEqual({ daily: 3, monthly: null })
    expect(readQuota(new Headers({ 'x-resend-monthly-quota': '1200' }))).toEqual({ daily: null, monthly: 1200 })
    expect(readQuota(new Headers({ 'x-resend-daily-quota': 'lots' }))).toBeNull()
    expect(deploymentEnv({ VERCEL_ENV: 'preview' })).toBe('preview')
    expect(deploymentEnv({})).toBe('development')
  })
})

describe('Resend’s webhooks', () => {
  const secret = `whsec_${Buffer.from('a test signing secret, 32 bytes!').toString('base64')}`
  const now = new Date('2026-10-23T08:00:00Z')
  const timestamp = String(Math.floor(now.getTime() / 1000))
  const sign = (body: string, at = timestamp, id = 'msg_1', key = secret) =>
    createHmac('sha256', Buffer.from(key.slice('whsec_'.length), 'base64')).update(`${id}.${at}.${body}`).digest('base64')

  it('checks the Svix signature and its time', () => {
    const body = '{"type":"email.delivered"}'
    const headers = { id: 'msg_1', timestamp, signature: `v1,${sign(body)}` }
    expect(verifyWebhook(secret, headers, body, now)).toBe(true)
    expect(verifyWebhook(secret, { ...headers, signature: `v1,${sign('{}')} v1,${sign(body)}` }, body, now)).toBe(true)
    expect(verifyWebhook(secret, headers, `${body} `, now)).toBe(false)
    expect(verifyWebhook(secret, { ...headers, id: 'msg_2' }, body, now)).toBe(false)
    expect(verifyWebhook(secret, { ...headers, signature: `v2,${sign(body)}` }, body, now)).toBe(false)
    expect(verifyWebhook(`whsec_${Buffer.from('another secret').toString('base64')}`, headers, body, now)).toBe(false)
    const old = String(Number(timestamp) - 6 * 60)
    expect(verifyWebhook(secret, { id: 'msg_1', timestamp: old, signature: `v1,${sign(body, old)}` }, body, now)).toBe(false)
    expect(verifyWebhook(secret, { id: null, timestamp, signature: headers.signature }, body, now)).toBe(false)
    expect(verifyWebhook('', headers, body, now)).toBe(false)
  })

  const payload = (type: string, data: Record<string, unknown> = {}) => ({
    type,
    created_at: '2026-10-23T08:01:00.000Z',
    data: {
      email_id: 'email-a',
      created_at: '2026-10-23T08:00:01.000Z',
      to: ['reader@gmail.com'],
      tags: { kind: 'daily', env: 'production', subscriber: '7', send: '41' },
      ...data,
    },
  })
  const event = (type: string, data: Record<string, unknown> = {}) => readDeliveryEvent(payload(type, data)) as DeliveryEvent

  it('reads the event and its tags, as an object or as the list the API takes', () => {
    expect(event('email.bounced', { bounce: { type: 'Permanent', subType: 'General', message: 'No such user' } })).toEqual({
      type: 'email.bounced',
      emailId: 'email-a',
      to: 'reader@gmail.com',
      sentAt: '2026-10-23T08:00:01.000Z',
      tags: { kind: 'daily', env: 'production', subscriber: '7', send: '41' },
      bounceType: 'Permanent',
      detail: 'No such user',
    })
    expect(event('email.sent', { tags: [{ name: 'kind', value: 'daily_welcome' }] }).tags).toEqual({ kind: 'daily_welcome' })
    expect(readDeliveryEvent({ type: 'contact.created', data: {} })).toBeNull()
    expect(readDeliveryEvent('nope')).toBeNull()
  })

  it('moves the row forward and stops the address on a permanent bounce or a complaint', () => {
    expect(planEvent(event('email.delivered'), 'production')).toEqual({
      subscriberId: 7,
      send: { id: 41, status: 'delivered', from: ['sending', 'sent'], error: null, refund: false },
      stop: null,
    })
    expect(planEvent(event('email.bounced', { bounce: { type: 'Permanent', message: 'No such user' } }), 'production')).toEqual({
      subscriberId: 7,
      send: { id: 41, status: 'bounced', from: ['sending', 'sent', 'delivered'], error: 'No such user', refund: false },
      stop: 'bounce',
    })
    expect(planEvent(event('email.bounced', { bounce: { type: 'Temporary', message: 'Mailbox full' } }), 'production')?.stop).toBeNull()
    expect(planEvent(event('email.complained'), 'production')?.stop).toBe('complaint')
    expect(planEvent(event('email.suppressed', { suppressed: { type: 'OnAccountSuppressionList' } }), 'production')?.stop).toBe('bounce')
  })

  it('gives a failure back as a try when it was the quota', () => {
    expect(planEvent(event('email.failed', { failed: { reason: 'reached_daily_quota' } }), 'production')?.send).toMatchObject({
      status: 'failed',
      error: 'reached_daily_quota',
      refund: true,
    })
    expect(planEvent(event('email.failed', { failed: { reason: 'invalid_recipient' } }), 'production')?.send?.refund).toBe(false)
  })

  it('stops a subscription whose welcome email bounced, with no row to move', () => {
    const welcome = event('email.bounced', { tags: { kind: 'daily_welcome', env: 'production', subscriber: '9' } })
    expect(planEvent(welcome, 'production')).toEqual({ subscriberId: 9, send: null, stop: 'bounce' })
  })

  it('leaves alone what is not ours: another deployment, other emails, test emails, opens and clicks', () => {
    expect(planEvent(event('email.bounced'), 'preview')).toBeNull()
    expect(planEvent(event('email.bounced', { tags: { kind: 'daily_test', env: 'production' } }), 'production')).toBeNull()
    expect(planEvent(event('email.bounced', { tags: {} }), 'production')).toBeNull()
    expect(planEvent(event('email.bounced', { tags: { kind: 'daily', env: 'production', send: '41' } }), 'production')).toBeNull()
    expect(planEvent(event('email.opened'), 'production')).toBeNull()
    expect(planEvent(event('email.delivery_delayed'), 'production')).toBeNull()
  })

  it('keeps the strongest reason, and ignores stops about emails from before the reader came back', () => {
    expect(stopReasonAfter({ status: 'subscribed', stopReason: null }, 'bounce')).toBe('bounce')
    expect(stopReasonAfter({ status: 'unsubscribed', stopReason: null }, 'complaint')).toBe('complaint')
    expect(stopReasonAfter({ status: 'stopped', stopReason: 'owner' }, 'bounce')).toBe('bounce')
    expect(stopReasonAfter({ status: 'stopped', stopReason: 'bounce' }, 'complaint')).toBe('complaint')
    expect(stopReasonAfter({ status: 'stopped', stopReason: 'complaint' }, 'bounce')).toBeNull()
    expect(stopReasonAfter({ status: 'stopped', stopReason: 'bounce' }, 'bounce')).toBeNull()

    expect(stopApplies('2026-10-20T00:00:00.000Z', '2026-10-23T08:00:00.000Z')).toBe(true)
    expect(stopApplies('2026-10-23T09:00:00.000Z', '2026-10-23T08:00:00.000Z')).toBe(false)
    // Resend's clock a little behind ours: the welcome email right after subscribing still counts.
    expect(stopApplies('2026-10-23T08:00:02.000Z', '2026-10-23T08:00:01.000Z')).toBe(true)
    expect(stopApplies(null, '2026-10-23T08:00:00.000Z')).toBe(true)
  })
})

describe('the subscriber list’s numbers', () => {
  const now = new Date('2026-10-23T08:00:00Z')

  it('counts today against the free plan’s 100, from Resend’s last reading when it is from today', () => {
    expect(quotaView({ dailyUsed: 30, monthlyUsed: 400, readAt: new Date('2026-10-23T07:00:00Z') }, 12, now)).toEqual({
      plan: 'free',
      limit: 100,
      used: 30,
      remaining: 70,
      readAt: '2026-10-23T07:00:00.000Z',
      low: false,
    })
    // Yesterday's reading (UTC): only this site's own count today.
    expect(quotaView({ dailyUsed: 95, monthlyUsed: 400, readAt: new Date('2026-10-22T23:00:00Z') }, 12, now)).toMatchObject({ used: 12, readAt: null })
    expect(quotaView(null, 85, now)).toMatchObject({ plan: 'free', remaining: 15, low: true })
    expect(quotaView(null, 120, now)).toMatchObject({ remaining: 0, low: true })
  })

  it('knows a paid plan by its missing daily count', () => {
    expect(quotaView({ dailyUsed: null, monthlyUsed: 5000, readAt: new Date('2026-10-23T07:00:00Z') }, 12, now)).toEqual({
      plan: 'paid',
      monthlyUsed: 5000,
      readAt: '2026-10-23T07:00:00.000Z',
    })
    expect(upgradeDue(quotaView(null, 0, now), 80)).toBe(true)
    expect(upgradeDue(quotaView(null, 0, now), 79)).toBe(false)
    expect(upgradeDue(quotaView({ dailyUsed: null, monthlyUsed: 5000, readAt: now }, 0, now), 500)).toBe(false)
  })
})
