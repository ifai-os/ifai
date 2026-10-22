import { describe, expect, it } from 'vitest'

import { normalizeUrl, siteOf } from '@/modules/daily/url'

describe('normalizeUrl', () => {
  it('drops tracking parameters, fragments and trailing slashes', () => {
    expect(
      normalizeUrl('https://TechCrunch.com/2026/10/22/story/?utm_source=futuretools&utm_medium=web&fbclid=abc#top'),
    ).toBe('https://techcrunch.com/2026/10/22/story')
    expect(normalizeUrl('https://x.com/openai/status/1?ref_src=twsrc&s=20')).toBe('https://x.com/openai/status/1?s=20')
  })

  it('keeps parameters that identify the page', () => {
    expect(normalizeUrl('https://www.youtube.com/watch?v=abc123&si=track')).toBe('https://www.youtube.com/watch?v=abc123')
    expect(normalizeUrl('https://news.ycombinator.com/item?id=42')).toBe('https://news.ycombinator.com/item?id=42')
  })

  it('resolves relative links against the page', () => {
    expect(normalizeUrl('/articles/one/', 'https://www.therundown.ai/articles')).toBe(
      'https://www.therundown.ai/articles/one',
    )
    expect(normalizeUrl('//cdn.example.com/a', 'https://example.com')).toBe('https://cdn.example.com/a')
  })

  it('rejects anything that is not a web page', () => {
    expect(normalizeUrl('mailto:hello@example.com')).toBeNull()
    expect(normalizeUrl('javascript:void(0)')).toBeNull()
    expect(normalizeUrl('not a url')).toBeNull()
    expect(normalizeUrl('http://localhost/x')).toBeNull()
    expect(normalizeUrl('https://user:pw@example.com/p')).toBe('https://example.com/p')
  })

  it('keeps the root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})

describe('siteOf', () => {
  it('returns the host without www', () => {
    expect(siteOf('https://www.theverge.com/ai/1')).toBe('theverge.com')
    expect(siteOf('nope')).toBeNull()
  })
})
