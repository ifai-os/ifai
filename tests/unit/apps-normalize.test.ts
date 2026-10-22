import { describe, expect, it } from 'vitest'

import { domainFromUrl, isHttpUrl, isValidSlug, reservedAppSlugs, slugify } from '@/modules/apps/normalize'

describe('app slugs', () => {
  it('makes lowercase English slugs from names', () => {
    expect(slugify('Kimi Slides')).toBe('kimi-slides')
    expect(slugify('Canva AI')).toBe('canva-ai')
    expect(slugify('  Pi Agent!! ')).toBe('pi-agent')
    expect(slugify('Créa·tor 2.0')).toBe('crea-tor-2-0')
  })

  it('gives an empty slug for names without Latin letters', () => {
    expect(slugify('腾讯元宝')).toBe('')
  })

  it('accepts only lowercase words joined by single hyphens', () => {
    expect(isValidSlug('kimi-slides')).toBe(true)
    expect(isValidSlug('gpt4o')).toBe(true)
    expect(isValidSlug('Kimi-Slides')).toBe(false)
    expect(isValidSlug('kimi--slides')).toBe(false)
    expect(isValidSlug('-kimi')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })

  it('reserves the slugs used by fixed pages under /apps', () => {
    expect(reservedAppSlugs).toEqual(['submit', 'category'])
  })
})

describe('app websites', () => {
  it('accepts http(s) only', () => {
    expect(isHttpUrl('https://claude.ai')).toBe(true)
    expect(isHttpUrl('http://example.com/path')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('claude.ai')).toBe(false)
  })

  it('takes the domain from the website, without www.', () => {
    expect(domainFromUrl('https://www.Kimi.com/slides?utm_source=x')).toBe('kimi.com')
    expect(domainFromUrl('https://chat.deepseek.com')).toBe('chat.deepseek.com')
    expect(domainFromUrl('not a url')).toBeUndefined()
  })
})
