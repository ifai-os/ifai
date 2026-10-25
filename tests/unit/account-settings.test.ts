import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { memberName } from '@/components/account/member-avatar'
import { parseSection, sectionHref, sectionPath, settingsSections } from '@/components/account/sections'
import { describeDevice, deviceLabel } from '@/lib/auth/devices'
import { withCleanName } from '@/lib/auth/nickname'
import { dailyEmailState } from '@/lib/auth/settings'
import { subscriberIdFromToken } from '@/modules/daily/email/links'

describe('describeDevice', () => {
  const cases: [string, string | null, boolean][] = [
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mac · Chrome',
      false,
    ],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', 'Mac · Safari', false],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'iPhone · Safari',
      true,
    ],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', 'iPhone · Chrome', true],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15', 'iPad · Firefox', true],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Windows · Edge',
      false,
    ],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0', 'Windows · Firefox', false],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
      'Android · Samsung Internet',
      true,
    ],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0', 'Linux · Opera', false],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'ChromeOS · Chrome', false],
    ['curl/8.5.0', null, false],
  ]

  it.each(cases)('%s', (userAgent, label, handheld) => {
    const device = describeDevice(userAgent)
    expect(deviceLabel(device)).toBe(label)
    expect(device.handheld).toBe(handheld)
  })

  it('knows nothing without a browser identification, and says what it knows', () => {
    expect(deviceLabel(describeDevice(null))).toBeNull()
    expect(deviceLabel(describeDevice(''))).toBeNull()
    expect(deviceLabel(describeDevice('Mozilla/5.0 (Windows NT 10.0) SomeBrowser/1.0'))).toBe('Windows')
  })
})

describe('the settings sections', () => {
  it('reads ?section=, and anything else is the profile', () => {
    for (const section of settingsSections) expect(parseSection(section)).toBe(section)
    for (const value of [undefined, '', 'privacy', 'Profile', ['data']]) expect(parseSection(value)).toBe('profile')
  })

  it('makes the addresses Link and Better Auth take', () => {
    expect(sectionHref('profile')).toBe('/me/account')
    expect(sectionHref('data')).toBe('/me/account?section=data')
    expect(sectionPath('zh-Hans', 'profile')).toBe('/zh-hans/me/account')
    expect(sectionPath('en', 'sign-in', 'provider=google')).toBe('/en/me/account?section=sign-in&provider=google')
    expect(sectionPath('ja', 'profile', 'provider=github')).toBe('/ja/me/account?provider=github')
  })
})

describe('withCleanName', () => {
  it('cleans the name like a review signature, keeping the rest of the body', () => {
    expect(withCleanName({ name: '  Lin\nQi​ ' })).toEqual({ name: 'Lin Qi' })
    expect(withCleanName({ name: 'x'.repeat(40), image: null })).toEqual({ name: 'x'.repeat(30), image: null })
  })

  it('refuses a name that cleans to nothing', () => {
    for (const name of ['', '   ', '​‎', 42, null]) expect(withCleanName({ name })).toBe('empty')
  })

  it('leaves bodies without a name alone', () => {
    expect(withCleanName({ uiLocale: 'ja' })).toBeNull()
    expect(withCleanName(undefined)).toBeNull()
  })
})

describe('memberName', () => {
  it('is the nickname, or the email before the @ while there is none', () => {
    expect(memberName({ name: ' 林栖 ', email: 'lin@example.com' })).toBe('林栖')
    expect(memberName({ name: '', email: 'lin@example.com' })).toBe('lin')
  })
})

describe('dailyEmailState', () => {
  afterEach(() => vi.unstubAllEnvs())

  const payloadWith = (docs: object[]) => {
    const find = vi.fn().mockResolvedValue({ docs })
    return { payload: { find } as unknown as Payload, find }
  }

  it('reads the subscription of a verified sign-in email, with the token of its manage page', async () => {
    vi.stubEnv('PAYLOAD_SECRET', 'test-secret')
    const { payload, find } = payloadWith([{ id: 12, status: 'subscribed' }])
    const state = await dailyEmailState(payload, { email: ' Lin@Example.com', emailVerified: true })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'subscribers', where: { email: { equals: 'lin@example.com' } } }))
    expect(state).toMatchObject({ status: 'subscribed' })
    expect(state.status !== 'none' && subscriberIdFromToken(state.token)).toBe(12)
  })

  it('says when the emails were stopped, and has nothing to manage after unsubscribing', async () => {
    vi.stubEnv('PAYLOAD_SECRET', 'test-secret')
    expect(await dailyEmailState(payloadWith([{ id: 3, status: 'stopped' }]).payload, { email: 'a@example.com', emailVerified: true })).toMatchObject({
      status: 'stopped',
    })
    expect(await dailyEmailState(payloadWith([{ id: 3, status: 'unsubscribed' }]).payload, { email: 'a@example.com', emailVerified: true })).toEqual({
      status: 'none',
    })
    expect(await dailyEmailState(payloadWith([]).payload, { email: 'a@example.com', emailVerified: true })).toEqual({ status: 'none' })
  })

  it('does not look for an address the member has not shown is theirs', async () => {
    const { payload, find } = payloadWith([{ id: 12, status: 'subscribed' }])
    expect(await dailyEmailState(payload, { email: 'lin@example.com', emailVerified: false })).toEqual({ status: 'none' })
    expect(find).not.toHaveBeenCalled()
  })
})
