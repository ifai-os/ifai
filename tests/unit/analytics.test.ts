import { describe, expect, it } from 'vitest'

import { analyticsUrl } from '@/lib/analytics'

describe('analyticsUrl', () => {
  it('keeps the page and category, drops tokens, searches and fragments', () => {
    expect(analyticsUrl('https://ifai.io/en/news?category=research&page=2')).toBe('https://ifai.io/en/news?page=2&category=research')
    expect(analyticsUrl('https://ifai.io/zh-hans/news/subscription?token=abc.def&unsubscribe=1')).toBe('https://ifai.io/zh-hans/news/subscription')
    expect(analyticsUrl('https://ifai.io/en/search?q=my+private+words#top')).toBe('https://ifai.io/en/search')
    expect(analyticsUrl('https://ifai.io/en/news/some-story')).toBe('https://ifai.io/en/news/some-story')
  })
})
