import { describe, expect, it } from 'vitest'

import {
  checkHandle,
  daysSince,
  generatedHandlePattern,
  isHandle,
  nextHandleChange,
  normalizeHandle,
  parseBefore,
  parseFollowInput,
  parseProfileInput,
  parseProfileTab,
  parseWebsite,
  peoplePath,
  profileLocale,
  profilePath,
  profileRules,
  rankSuggestions,
  websiteLabel,
} from '@/modules/profiles/rules'
import { newHandle } from '@/modules/profiles/handles'

const day = 24 * 60 * 60 * 1000

describe('profiles: addresses', () => {
  it('takes 3–20 lowercase letters, digits and inner hyphens', () => {
    expect(isHandle('lin')).toBe(true)
    expect(isHandle('lin-qi-2026')).toBe(true)
    expect(isHandle('a'.repeat(profileRules.maxHandle))).toBe(true)
    expect(isHandle('ab')).toBe(false)
    expect(isHandle('a'.repeat(profileRules.maxHandle + 1))).toBe(false)
    expect(isHandle('-lin')).toBe(false)
    expect(isHandle('lin-')).toBe(false)
    expect(isHandle('lin--qi')).toBe(false)
    expect(isHandle('lin_qi')).toBe(false)
    expect(isHandle('林栖')).toBe(false)
    expect(isHandle('Lin')).toBe(false)
  })

  it('lowercases and trims what a member types', () => {
    expect(normalizeHandle('  LinQi ')).toBe('linqi')
    expect(checkHandle(' LinQi ')).toEqual({ ok: true, handle: 'linqi' })
  })

  it('keeps back the site’s own words, ifai… and the addresses IFAI gives', () => {
    expect(checkHandle('admin')).toEqual({ ok: false, error: 'reserved-handle' })
    expect(checkHandle('circles')).toEqual({ ok: false, error: 'reserved-handle' })
    expect(checkHandle('ifai-team')).toEqual({ ok: false, error: 'reserved-handle' })
    expect(checkHandle('u-0123456789')).toEqual({ ok: false, error: 'reserved-handle' })
    expect(checkHandle('lin qi')).toEqual({ ok: false, error: 'invalid-handle' })
    expect(checkHandle(42)).toEqual({ ok: false, error: 'invalid-handle' })
  })

  it('gives new members an address of their own shape', () => {
    const handle = newHandle()
    expect(handle).toMatch(generatedHandlePattern)
    expect(isHandle(handle)).toBe(true)
    expect(newHandle()).not.toBe(handle)
  })

  it('links to the page and the two lists', () => {
    expect(profilePath('linqi')).toBe('/u/linqi')
    expect(peoplePath('linqi', 'followers')).toBe('/u/linqi/followers')
    expect(peoplePath('linqi', 'following')).toBe('/u/linqi/following')
  })

  it('lets a member change it once every 30 days, the first time at once', () => {
    const now = new Date('2026-10-25T00:00:00Z')
    expect(nextHandleChange(null, now)).toBeNull()
    expect(nextHandleChange(new Date(now.getTime() - 10 * day), now)).toEqual(new Date(now.getTime() + 20 * day))
    expect(nextHandleChange(new Date(now.getTime() - 30 * day), now)).toBeNull()
  })
})

describe('profiles: the line about oneself and the site', () => {
  it('adds https:// and keeps http(s) addresses with a real host', () => {
    expect(parseWebsite('example.com')).toEqual({ ok: true, value: 'https://example.com/' })
    expect(parseWebsite(' http://example.com/blog ')).toEqual({ ok: true, value: 'http://example.com/blog' })
    expect(parseWebsite('')).toEqual({ ok: true, value: null })
    expect(parseWebsite(null)).toEqual({ ok: true, value: null })
  })

  it('turns down other schemes, user names, hosts without a dot and long addresses', () => {
    expect(parseWebsite('javascript:alert(1)')).toEqual({ ok: false })
    expect(parseWebsite('ftp://example.com')).toEqual({ ok: false })
    expect(parseWebsite('https://user:pass@example.com')).toEqual({ ok: false })
    expect(parseWebsite('localhost')).toEqual({ ok: false })
    expect(parseWebsite('http://[::1]/')).toEqual({ ok: false })
    expect(parseWebsite(`example.com/${'a'.repeat(profileRules.maxWebsite)}`)).toEqual({ ok: false })
    expect(parseWebsite(42)).toEqual({ ok: false })
  })

  it('shows the site without the scheme or a closing slash', () => {
    expect(websiteLabel('https://example.com/')).toBe('example.com')
    expect(websiteLabel('https://example.com/blog/')).toBe('example.com/blog')
    expect(websiteLabel('https://example.com/%E5%8D%9A%E5%AE%A2')).toBe('example.com/博客')
  })

  it('reads the settings form: only the fields sent, cleaned', () => {
    expect(parseProfileInput({ locale: 'zh-Hans', bio: '  做 AI 产品\n的人 ', website: 'example.com' })).toEqual({
      ok: true,
      value: { locale: 'zh-Hans', bio: '做 AI 产品 的人', website: 'https://example.com/' },
    })
    expect(parseProfileInput({ locale: 'en', handle: ' LinQi ' })).toEqual({ ok: true, value: { locale: 'en', handle: 'linqi' } })
    expect(parseProfileInput({ locale: 'en', website: null })).toEqual({ ok: true, value: { locale: 'en', website: null } })
  })

  it('says what is wrong with the settings form', () => {
    expect(parseProfileInput({ bio: 'hi' })).toEqual({ ok: false, error: 'invalid-locale' })
    expect(parseProfileInput({ locale: 'en', handle: 'a' })).toEqual({ ok: false, error: 'invalid-handle' })
    expect(parseProfileInput({ locale: 'en', bio: '画'.repeat(profileRules.maxBio + 1) })).toEqual({ ok: false, error: 'bio-too-long' })
    expect(parseProfileInput({ locale: 'en', bio: '画'.repeat(profileRules.maxBio) }).ok).toBe(true)
    expect(parseProfileInput({ locale: 'en', website: 'javascript:void(0)' })).toEqual({ ok: false, error: 'invalid-website' })
    expect(parseProfileInput({ locale: 'en', bio: 42 })).toEqual({ ok: false, error: 'invalid-request' })
    expect(parseProfileInput(null)).toEqual({ ok: false, error: 'invalid-request' })
  })
})

describe('profiles: following', () => {
  it('reads a follow in any case, and nothing else', () => {
    expect(parseFollowInput({ handle: 'LinQi', on: true })).toEqual({ handle: 'linqi', on: true })
    expect(parseFollowInput({ handle: 'linqi', on: false })).toEqual({ handle: 'linqi', on: false })
    expect(parseFollowInput({ handle: 'linqi', on: 'yes' })).toBeNull()
    expect(parseFollowInput({ handle: 'a', on: true })).toBeNull()
    expect(parseFollowInput(null)).toBeNull()
  })

  it('suggests the people others answered most, never the reader or someone they follow', () => {
    const person = (userId: string, people: number, posts: number, lastPost: number) => ({ userId, people, posts, lastPost })
    const ranked = rankSuggestions(
      [person('quiet', 0, 9, 9), person('liked', 5, 1, 1), person('busy', 5, 3, 1), person('recent', 5, 3, 2), person('me', 9, 9, 9), person('followed', 8, 1, 1)],
      { exclude: new Set(['me', 'followed']), limit: 3 },
    )
    expect(ranked.map((item) => item.userId)).toEqual(['recent', 'busy', 'liked'])
  })
})

describe('profiles: the page', () => {
  it('reads the tab and the page from the address', () => {
    expect(parseProfileTab(undefined)).toBe('posts')
    expect(parseProfileTab('reviews')).toBe('reviews')
    expect(parseProfileTab('circles')).toBe('circles')
    expect(parseProfileTab('saves')).toBe('posts')
    expect(parseBefore('120')).toBe(120)
    expect(parseBefore('0')).toBeNull()
    expect(parseBefore('-3')).toBeNull()
    expect(parseBefore('1.5')).toBeNull()
    expect(parseBefore('99999999999999999')).toBeNull()
    expect(parseBefore(['3'])).toBeNull()
  })

  it('is canonical in the language of the line about them, English without one', () => {
    expect(profileLocale({ bio: '做 AI 产品的人', bioLang: 'zh-Hans' })).toBe('zh-Hans')
    expect(profileLocale({ bio: 'Bonjour', bioLang: 'und' })).toBe('en')
    expect(profileLocale({ bio: '', bioLang: 'ja' })).toBe('en')
  })

  it('counts the days on IFAI from the first', () => {
    const now = new Date('2026-10-25T12:00:00Z')
    expect(daysSince(now, now)).toBe(1)
    expect(daysSince(new Date(now.getTime() - 2 * 60 * 60 * 1000), now)).toBe(1)
    expect(daysSince(new Date(now.getTime() - 3 * day - 1), now)).toBe(4)
  })
})
