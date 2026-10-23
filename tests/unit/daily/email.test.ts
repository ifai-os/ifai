import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { domainOf, editDistance, isEmailAddress, maskEmail, normalizeEmail, suggestEmail } from '@/modules/daily/email/address'
import { dailyEmailFrom, deliveryConfigured, sendEmail, subscribingOpen, type OutgoingEmail } from '@/modules/daily/email/delivery'
import { zoneName } from '@/modules/daily/email/format'
import { checkMailDomain, forgetResolverCheck, type MailLookup } from '@/modules/daily/email/mail-domain'
import { planManage, planSubscribe, readManageRequest, readSubscribeRequest, welcomeAllowed } from '@/modules/daily/email/rules'
import { nextSendAt, zonedInstant } from '@/modules/daily/email/schedule'
import { subscriberIdOf, subscriberToken } from '@/modules/daily/email/token'
import { subscriptionView, zoneOptions } from '@/modules/daily/email/view'
import { buildWelcomeEmail } from '@/modules/daily/email/welcome'
import type { Subscriber } from '@/payload-types'

describe('email addresses', () => {
  it('normalizes what people type: case, spaces, full-width characters, CJK dots, international domains', () => {
    expect(normalizeEmail('  Hawk.Leu@Gmail.COM ')).toBe('hawk.leu@gmail.com')
    expect(normalizeEmail('ｎａｍｅ＠ｇｍａｉｌ．ｃｏｍ')).toBe('name@gmail.com')
    expect(normalizeEmail('name@gmail。com')).toBe('name@gmail.com')
    expect(normalizeEmail('name@example.com.')).toBe('name@example.com')
    expect(normalizeEmail('name@例え.jp')).toBe('name@xn--r8jz45g.jp')
  })

  it('accepts ordinary mailboxes and turns down malformed ones', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.co.jp', "o'brien@example.ie", 'name@xn--r8jz45g.jp']) {
      expect(isEmailAddress(ok), ok).toBe(true)
    }
    for (const bad of [
      '',
      'name',
      'name@',
      '@gmail.com',
      'name@gmail',
      'name@gmail.c',
      'name@-gmail.com',
      'name@gmail..com',
      '.name@gmail.com',
      'na..me@gmail.com',
      'na me@gmail.com',
      '名字@gmail.com',
      `${'a'.repeat(65)}@gmail.com`,
      'name@gmail.123',
    ]) {
      expect(isEmailAddress(bad), bad).toBe(false)
    }
    expect(domainOf('name@mail.example.com')).toBe('mail.example.com')
  })

  it('suggests the provider a typo was close to', () => {
    expect(suggestEmail('name@gmial.com')).toEqual({ address: 'name@gmail.com', domain: 'gmail.com' })
    expect(suggestEmail('name@gmai.com')?.domain).toBe('gmail.com')
    expect(suggestEmail('name@hotmial.com')?.domain).toBe('hotmail.com')
    expect(suggestEmail('name@yaho.com')?.domain).toBe('yahoo.com')
    expect(suggestEmail('name@outlok.com')?.domain).toBe('outlook.com')
    expect(suggestEmail('name@qq.con')?.domain).toBe('qq.com')
    expect(suggestEmail('name@163.cm')?.domain).toBe('163.com')
    expect(suggestEmail('name@navre.com')?.domain).toBe('naver.com')
    expect(suggestEmail('name@ifai.con')).toEqual({ address: 'name@ifai.com', domain: 'ifai.com' })
  })

  it('leaves known providers, their real neighbours and unrelated domains alone', () => {
    for (const email of ['name@gmail.com', 'name@mail.com', 'name@live.cn', 'name@vip.qq.com', 'name@ifai.io', 'name@company.example', 'name@university.ac.jp']) {
      expect(suggestEmail(email), email).toBeNull()
    }
  })

  it('counts a swap of neighbours as one edit', () => {
    expect(editDistance('gmial.com', 'gmail.com')).toBe(1)
    expect(editDistance('abc', 'abc')).toBe(0)
    expect(editDistance('', 'abc')).toBe(3)
  })

  it('masks the address for the manage page', () => {
    expect(maskEmail('hawk@gmail.com')).toBe('ha•••@gmail.com')
    expect(maskEmail('ab@gmail.com')).toBe('a•••@gmail.com')
    expect(maskEmail('a@gmail.com')).toBe('a•••@gmail.com')
  })
})

describe('whether a domain takes mail', () => {
  beforeEach(() => forgetResolverCheck())

  const failure = (code: string) => Object.assign(new Error(code), { code })
  const lookup = (answers: { mx?: string[] | string; a?: string[] | string; aaaa?: string[] | string; canary?: string[] | string }): MailLookup => {
    const answer = <T>(value: string[] | string | undefined, wrap: (item: string) => T) =>
      typeof value === 'string' ? Promise.reject(failure(value)) : Promise.resolve((value ?? []).map(wrap))
    return {
      resolveMx: (domain) =>
        answer(domain === 'gmail.com' && answers.canary !== undefined ? answers.canary : answers.mx, (exchange) => ({ exchange, priority: 10 })),
      resolve4: () => answer(answers.a, (address) => address),
      resolve6: () => answer(answers.aaaa, (address) => address),
    }
  }

  it('takes an MX record, or an A or AAAA record when there is no MX', async () => {
    expect(await checkMailDomain('example.org', lookup({ mx: ['mx.example.org'] }))).toBe('ok')
    expect(await checkMailDomain('example.org', lookup({ mx: 'ENODATA', a: ['192.0.2.1'] }))).toBe('ok')
    expect(await checkMailDomain('example.org', lookup({ mx: 'ENODATA', a: 'ENODATA', aaaa: ['2001:db8::1'] }))).toBe('ok')
  })

  it('turns down a domain with a null MX or no records at all', async () => {
    expect(await checkMailDomain('example.com', lookup({ mx: [''] }))).toBe('no-mail')
    expect(await checkMailDomain('example.com', lookup({ mx: ['.'] }))).toBe('no-mail')
    expect(await checkMailDomain('example.org', lookup({ mx: 'ENODATA', a: 'ENODATA', aaaa: 'ENODATA' }))).toBe('no-mail')
    expect(await checkMailDomain('gmial.invalid', lookup({ mx: 'ENOTFOUND', a: 'ENOTFOUND', aaaa: 'ENOTFOUND', canary: ['gmail-smtp-in.l.google.com'] }))).toBe(
      'no-mail',
    )
  })

  it('lets the address through when the lookup itself fails', async () => {
    expect(await checkMailDomain('example.org', lookup({ mx: 'ETIMEOUT' }))).toBe('unknown')
    expect(await checkMailDomain('example.org', lookup({ mx: 'ENODATA', a: 'ESERVFAIL' }))).toBe('unknown')
    // A resolver that finds nothing at all, not even gmail.com, is broken rather than right.
    expect(await checkMailDomain('ifai.io', lookup({ mx: 'ENOTFOUND', a: 'ENOTFOUND', aaaa: 'ENOTFOUND', canary: 'ENOTFOUND' }))).toBe('unknown')
  })
})

describe('subscription tokens', () => {
  it('signs a subscriber id and reads it back', () => {
    const token = subscriberToken(42, 'secret')
    expect(token).toMatch(/^42\.[A-Za-z0-9_-]{32}$/)
    expect(subscriberIdOf(token, 'secret')).toBe(42)
  })

  it('refuses tampered, foreign and malformed tokens', () => {
    const token = subscriberToken(42, 'secret')
    expect(subscriberIdOf(token.replace(/^42/, '43'), 'secret')).toBeNull()
    expect(subscriberIdOf(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 'secret')).toBeNull()
    expect(subscriberIdOf(token, 'another secret')).toBeNull()
    expect(subscriberIdOf(token, '')).toBeNull()
    for (const bad of ['', '42', '42.', 'abc.def', '0.x', '-1.x', `${token}x`, null, 42, undefined]) {
      expect(subscriberIdOf(bad, 'secret'), String(bad)).toBeNull()
    }
    expect(() => subscriberToken(42, '')).toThrow()
  })
})

describe('sending at 8 in the morning, local time', () => {
  const at = (iso: string) => new Date(iso)

  it('finds 8:00 on the subscriber’s clock in whole-hour and half-hour zones', () => {
    expect(zonedInstant({ year: 2026, month: 10, day: 24 }, 8, 0, 'Asia/Tokyo').toISOString()).toBe('2026-10-23T23:00:00.000Z')
    expect(zonedInstant({ year: 2026, month: 10, day: 24 }, 8, 0, 'Asia/Kolkata').toISOString()).toBe('2026-10-24T02:30:00.000Z')
    expect(zonedInstant({ year: 2026, month: 10, day: 24 }, 8, 0, 'Asia/Kathmandu').toISOString()).toBe('2026-10-24T02:15:00.000Z')
    expect(zonedInstant({ year: 2026, month: 10, day: 24 }, 8, 0, 'UTC').toISOString()).toBe('2026-10-24T08:00:00.000Z')
  })

  it('sends today when it is not 8 yet, tomorrow once it is', () => {
    // 07:59 and 08:00 in Tokyo on 24 October.
    expect(nextSendAt(at('2026-10-23T22:59:00Z'), 'Asia/Tokyo').toISOString()).toBe('2026-10-23T23:00:00.000Z')
    expect(nextSendAt(at('2026-10-23T23:00:00Z'), 'Asia/Tokyo').toISOString()).toBe('2026-10-24T23:00:00.000Z')
    // Late on 31 December in Kolkata: the next is 1 January.
    expect(nextSendAt(at('2026-12-31T18:00:00Z'), 'Asia/Kolkata').toISOString()).toBe('2027-01-01T02:30:00.000Z')
  })

  it('follows daylight saving in Los Angeles', () => {
    // Summer time starts 8 March 2026: 8:00 is 15:00 UTC before, 16:00 UTC the day before.
    expect(nextSendAt(at('2026-03-07T17:00:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-03-08T15:00:00.000Z')
    expect(nextSendAt(at('2026-03-06T17:00:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-03-07T16:00:00.000Z')
    // It ends 1 November 2026: back to 16:00 UTC.
    expect(nextSendAt(at('2026-10-31T16:00:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-11-01T16:00:00.000Z')
    expect(nextSendAt(at('2026-10-30T16:00:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-10-31T15:00:00.000Z')
  })
})

describe('subscribe requests', () => {
  it('cleans the body the box sends', () => {
    expect(
      readSubscribeRequest({ email: ' Name@Gmail.com ', locale: 'ja', timeZone: 'Asia/Tokyo', page: '/ja/daily', website: '' }),
    ).toEqual({ email: 'name@gmail.com', locale: 'ja', timeZone: 'Asia/Tokyo', page: '/ja/daily', robot: false })
  })

  it('falls back to English and UTC, drops odd pages and spots the hidden field', () => {
    expect(readSubscribeRequest({ email: 'a@b.co', locale: 'xx', timeZone: 'Mars/Base', page: 'https://evil.example/' })).toEqual({
      email: 'a@b.co',
      locale: 'en',
      timeZone: 'UTC',
      page: null,
      robot: false,
    })
    expect(readSubscribeRequest({ email: 'a@b.co', page: '//evil.example' })?.page).toBeNull()
    expect(readSubscribeRequest({ email: 'a@b.co', website: 'http://spam.example' })?.robot).toBe(true)
  })

  it('refuses what is not a request', () => {
    for (const body of [null, 'a@b.co', 42, {}, { email: 42 }, { email: `${'a'.repeat(320)}@b.co` }]) {
      expect(readSubscribeRequest(body), JSON.stringify(body)).toBeNull()
    }
  })

  it('subscribes new addresses, brings unsubscribed ones back and leaves the rest alone', () => {
    expect(planSubscribe(null)).toBe('create')
    expect(planSubscribe({ status: 'unsubscribed' })).toBe('resubscribe')
    expect(planSubscribe({ status: 'subscribed' })).toBe('keep')
    expect(planSubscribe({ status: 'stopped' })).toBe('keep')
  })

  it('sends at most one welcome email a day', () => {
    const now = new Date('2026-10-23T12:00:00Z')
    expect(welcomeAllowed(null, now)).toBe(true)
    expect(welcomeAllowed('2026-10-23T01:00:00Z', now)).toBe(false)
    expect(welcomeAllowed('2026-10-22T12:00:00Z', now)).toBe(true)
  })
})

describe('managing a subscription', () => {
  const now = new Date('2026-10-23T12:00:00Z')
  const subscribed = { status: 'subscribed', stopReason: null, locale: 'en', timeZone: 'UTC' } as const

  it('reads the manage page’s requests', () => {
    expect(readManageRequest({ token: 't', pageLocale: 'ko', action: 'unsubscribe' })).toEqual({
      token: 't',
      pageLocale: 'ko',
      action: { type: 'unsubscribe' },
    })
    expect(readManageRequest({ token: 't', pageLocale: 'en', action: 'update', locale: 'ja', timeZone: 'Asia/Tokyo' })?.action).toEqual({
      type: 'update',
      locale: 'ja',
      timeZone: 'Asia/Tokyo',
    })
    for (const body of [
      null,
      { token: 't', pageLocale: 'en', action: 'delete' },
      { token: 't', pageLocale: 'xx', action: 'unsubscribe' },
      { pageLocale: 'en', action: 'unsubscribe' },
      { token: 't', pageLocale: 'en', action: 'update', locale: 'ja', timeZone: 'Nowhere' },
      { token: 't', pageLocale: 'en', action: 'update', locale: 'xx', timeZone: 'UTC' },
    ]) {
      expect(readManageRequest(body), JSON.stringify(body)).toBeNull()
    }
  })

  it('changes the language and time zone', () => {
    expect(planManage(subscribed, { type: 'update', locale: 'ja', timeZone: 'Asia/Tokyo' }, now)).toEqual({ locale: 'ja', timeZone: 'Asia/Tokyo' })
    expect(planManage(subscribed, { type: 'update', locale: 'en', timeZone: 'UTC' }, now)).toBe('unchanged')
  })

  it('unsubscribes once', () => {
    expect(planManage(subscribed, { type: 'unsubscribe' }, now)).toEqual({ status: 'unsubscribed', unsubscribedAt: now.toISOString() })
    expect(planManage({ ...subscribed, status: 'unsubscribed' }, { type: 'unsubscribe' }, now)).toBe('unchanged')
    expect(planManage({ ...subscribed, status: 'stopped', stopReason: 'bounce' }, { type: 'unsubscribe' }, now)).toBe('unchanged')
  })

  it('lets the reader lift an unsubscribe, a bounce or a complaint, but not the owner’s stop', () => {
    const back = { status: 'subscribed', stopReason: null, unsubscribedAt: null, subscribedAt: now.toISOString(), sourcePage: '/en/daily/subscription' }
    expect(planManage({ ...subscribed, status: 'unsubscribed' }, { type: 'resubscribe' }, now)).toEqual(back)
    expect(planManage({ ...subscribed, status: 'stopped', stopReason: 'bounce' }, { type: 'resubscribe' }, now)).toEqual(back)
    expect(planManage({ ...subscribed, status: 'stopped', stopReason: 'complaint' }, { type: 'resubscribe' }, now)).toEqual(back)
    expect(planManage({ ...subscribed, status: 'stopped', stopReason: 'owner' }, { type: 'resubscribe' }, now)).toBe('forbidden')
    expect(planManage(subscribed, { type: 'resubscribe' }, now)).toBe('unchanged')
  })
})

const subscriber = (overrides: Partial<Subscriber> = {}): Subscriber => ({
  id: 7,
  email: 'reader@gmail.com',
  locale: 'en',
  timeZone: 'Asia/Tokyo',
  status: 'subscribed',
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
  ...overrides,
})

describe('the manage page', () => {
  const now = new Date('2026-10-23T12:00:00Z')

  it('shows the masked address, the status and the next email on the subscriber’s clock', () => {
    expect(subscriptionView(subscriber(), 'en', now, true)).toEqual({
      email: 're•••@gmail.com',
      status: 'subscribed',
      stopReason: null,
      locale: 'en',
      timeZone: 'Asia/Tokyo',
      next: { time: 'Saturday, October 24 at 8:00 AM', zone: 'Japan Standard Time' },
    })
    expect(subscriptionView(subscriber({ status: 'stopped', stopReason: 'bounce' }), 'zh-Hans', now, true)).toMatchObject({ stopReason: 'bounce', next: null })
    expect(subscriptionView(subscriber({ status: 'unsubscribed', stopReason: 'bounce' }), 'en', now, true).stopReason).toBeNull()
    // With the daily email switched off there is no next one to promise.
    expect(subscriptionView(subscriber(), 'en', now, false).next).toBeNull()
  })

  it('lists every zone with its offset, UTC and the subscriber’s own name for it included', () => {
    const options = zoneOptions('Asia/Kolkata', now)
    const values = options.map((option) => option.value)
    expect(values).toContain('UTC')
    expect(values).toContain('Asia/Kolkata')
    expect(values).toContain('America/Los_Angeles')
    expect(options.find((option) => option.value === 'Asia/Tokyo')?.label).toBe('Asia/Tokyo (GMT+9)')
    expect(options.find((option) => option.value === 'America/Los_Angeles')?.label).toBe('America/Los Angeles (GMT-7)')
  })

  it('names UTC plainly', () => {
    expect(zoneName('UTC', 'zh-Hans')).toBe('UTC')
  })
})

describe('sending through Resend', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const email: OutgoingEmail = {
    to: 'reader@gmail.com',
    senderName: 'IFAI 日报',
    subject: '欢迎订阅 IFAI 日报',
    html: '<p>hi</p>',
    text: 'hi',
    headers: { 'List-Unsubscribe': '<https://ifai.example/api/subscriptions/unsubscribe?token=7.x>' },
    kind: 'daily_welcome',
  }

  it('reads the sending address from DAILY_EMAIL_FROM', () => {
    expect(dailyEmailFrom({ DAILY_EMAIL_FROM: 'news@ifai.io' })).toBe('news@ifai.io')
    expect(dailyEmailFrom({ DAILY_EMAIL_FROM: 'IFAI <news@ifai.io>' })).toBe('news@ifai.io')
    expect(dailyEmailFrom({ DAILY_EMAIL_FROM: ' ' })).toBeNull()
    expect(deliveryConfigured({ RESEND_API_KEY: 're_x', DAILY_EMAIL_FROM: 'news@ifai.io' })).toBe(true)
    expect(deliveryConfigured({ DAILY_EMAIL_FROM: 'news@ifai.io' })).toBe(false)
  })

  it('opens the boxes only with the switch on, and on Vercel only with Resend set up', () => {
    const resend = { RESEND_API_KEY: 're_x', DAILY_EMAIL_FROM: 'news@ifai.io' }
    expect(subscribingOpen({})).toBe(false)
    expect(subscribingOpen({ DAILY_EMAIL_ENABLED: 'true' })).toBe(true)
    expect(subscribingOpen({ DAILY_EMAIL_ENABLED: 'true', VERCEL_ENV: 'production' })).toBe(false)
    expect(subscribingOpen({ DAILY_EMAIL_ENABLED: 'true', VERCEL_ENV: 'preview' })).toBe(false)
    expect(subscribingOpen({ DAILY_EMAIL_ENABLED: 'true', VERCEL_ENV: 'production', ...resend })).toBe(true)
    expect(subscribingOpen({ DAILY_EMAIL_ENABLED: 'false', VERCEL_ENV: 'production', ...resend })).toBe(false)
  })

  it('prints the email locally and refuses on Vercel when Resend is not set up', async () => {
    const print = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await sendEmail(email, {})).toBeNull()
    expect(print.mock.calls[0][0]).toContain('reader@gmail.com')
    await expect(sendEmail(email, { VERCEL_ENV: 'production' })).rejects.toThrow(/DAILY_EMAIL_FROM/)
  })

  it('posts the email with the sender name, unsubscribe headers and its kind', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'email-1' }))
    expect(await sendEmail(email, { RESEND_API_KEY: 're_x', DAILY_EMAIL_FROM: 'news@ifai.io' })).toBe('email-1')
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_x')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      from: 'IFAI 日报 <news@ifai.io>',
      to: ['reader@gmail.com'],
      headers: email.headers,
      tags: [{ name: 'kind', value: 'daily_welcome' }],
    })
  })

  it('reports what Resend says when it refuses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('daily quota exceeded', { status: 429 }))
    await expect(sendEmail(email, { RESEND_API_KEY: 're_x', DAILY_EMAIL_FROM: 'news@ifai.io' })).rejects.toThrow(/429: daily quota exceeded/)
  })
})

describe('the welcome email', () => {
  beforeEach(() => {
    vi.stubEnv('PAYLOAD_SECRET', 'test-secret')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ifai.example')
    vi.stubEnv('DAILY_EMAIL_FROM', 'news@ifai.io')
  })
  afterEach(() => vi.unstubAllEnvs())

  const now = new Date('2026-10-23T12:00:00Z')

  it('says when the first email comes, on the subscriber’s clock and in their language', async () => {
    const email = await buildWelcomeEmail(subscriber(), now)
    expect(email.to).toBe('reader@gmail.com')
    expect(email.subject).toBe('Welcome to the IFAI Daily')
    expect(email.senderName).toBe('IFAI Daily')
    expect(email.html).toContain('<html lang="en">')
    expect(email.text).toContain('Japan Standard Time')
    expect(email.text).toContain('The first one arrives on Saturday, October 24 at 8:00 AM.')

    const zh = await buildWelcomeEmail(subscriber({ locale: 'zh-Hans', timeZone: 'America/Los_Angeles' }), now)
    expect(zh.subject).toBe('欢迎订阅 IFAI 日报')
    expect(zh.senderName).toBe('IFAI 日报')
    // 05:00 in Los Angeles: the first one comes this morning.
    expect(zh.text).toContain('第一封会在 10月23日星期五 8:00 送到。')
    expect(zh.text).toContain('不是你订阅的？一键退订: ')
    expect(email.text).toContain("Didn't sign up for this? Unsubscribe with one click: ")
    expect((await buildWelcomeEmail(subscriber({ locale: 'zh-Hant' }), now)).senderName).toBe('IFAI 日報')
  })

  it('carries signed manage and unsubscribe links, and the one-click headers', async () => {
    const email = await buildWelcomeEmail(subscriber({ locale: 'ko' }), now)
    const token = subscriberToken(7, 'test-secret')
    const manage = `https://ifai.example/ko/daily/subscription?token=${token}`
    expect(email.text).toContain(manage)
    expect(email.text).toContain(`${manage}&unsubscribe=1`)
    expect(email.html).toContain(`${manage}&amp;unsubscribe=1`)
    expect(email.headers).toEqual({
      'List-Unsubscribe': `<https://ifai.example/api/subscriptions/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(email.text).toContain('IFAI · https://ifai.example/ko · news@ifai.io')
    expect(email.kind).toBe('daily_welcome')
  })

  it('stays small and plain: no tracking, no scripts', async () => {
    for (const locale of ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const) {
      const email = await buildWelcomeEmail(subscriber({ locale }), now)
      expect(Buffer.byteLength(email.html), locale).toBeLessThan(100 * 1024)
      expect(email.html).not.toMatch(/<script|utm_/i)
      expect(email.html).toContain('https://ifai.example/icon-192.png')
    }
  })
})
