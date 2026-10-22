import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultSources } from '@/modules/daily/default-sources'
import { HOT_SIGNAL_MAX_MINUTES, INTERVAL_MAX_MINUTES } from '@/modules/daily/intake'
import { fetchText, MAX_SOURCE_BYTES, readSource, testFetch, userAgent } from '@/modules/daily/collect/fetch'
import { afterFetch, isDue } from '@/modules/daily/collect/plan'
import { validateSourceConfig, validateSourceUrl } from '@/modules/daily/source-config'
import { htmlListConfigSchema } from '@/modules/daily/types'

const now = new Date('2026-10-22T10:00:00Z')

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
<item><title>One</title><link>https://example.com/one?utm_source=rss</link><pubDate>Thu, 22 Oct 2026 09:30:00 +0000</pubDate></item>
<item><title>Two</title><link>https://example.com/two</link></item>
</channel></rss>`

const list = `<html><body><section><h2>Oct 22, 2026</h2>
<a href="https://news.example.com/story">Story</a>
<a href="https://futuretools.io/tools/x">Internal</a>
</section></body></html>`

const hn = JSON.stringify({
  hits: [
    { objectID: '1', title: 'Big', url: 'https://example.com/big', points: 120, num_comments: 40, created_at: '2026-10-22T08:00:00Z' },
    { objectID: '2', title: 'Small', url: 'https://example.com/small', points: 10, num_comments: 1, created_at: '2026-10-22T08:00:00Z' },
  ],
})

function stubFetch(body: string | ArrayBuffer, init: ResponseInit = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, requestInit?: RequestInit) => {
      calls.push({ url, init: requestInit })
      return new Response(body, { status: 200, ...init })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('readSource', () => {
  it('picks the reader by type', () => {
    expect(readSource({ type: 'rss', url: 'https://example.com/feed', config: null }, rss).map((i) => i.url)).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ])
    const config = { item: 'a[href^="http"]', group: 'section', groupDate: 'h2', skipHosts: ['futuretools.io'] }
    const found = readSource({ type: 'html_list', url: 'https://www.futuretools.io/news', config }, list)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ url: 'https://news.example.com/story', publishedAt: new Date('2026-10-22') })
    const hot = readSource({ type: 'json', url: 'https://hn.algolia.com/x', config: { kind: 'hacker_news', minPoints: 50 } }, hn)
    expect(hot.map((i) => i.url)).toEqual(['https://example.com/big'])
  })

  it('rejects settings that do not fit the type', () => {
    expect(() => readSource({ type: 'html_list', url: 'https://x.example', config: {} }, list)).toThrow()
    expect(() => readSource({ type: 'json', url: 'https://x.example', config: { kind: 'other' } }, hn)).toThrow()
  })
})

describe('fetchText', () => {
  it('identifies the crawler and returns the body', async () => {
    const calls = stubFetch(rss, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
    const result = await fetchText('https://example.com/feed')
    expect(result.body).toBe(rss)
    expect(result.contentType).toContain('rss')
    expect((calls[0].init?.headers as Record<string, string>)['user-agent']).toBe(userAgent())
    expect(userAgent()).toMatch(/^IFAIBot\/\d+\.\d+ \(\+https?:\/\//)
  })

  it('fails on error statuses and on oversized responses', async () => {
    stubFetch('nope', { status: 503 })
    await expect(fetchText('https://example.com/feed')).rejects.toMatchObject({ name: 'FetchError', status: 503 })
    stubFetch('x'.repeat(2049))
    await expect(fetchText('https://example.com/feed', { maxBytes: 2048 })).rejects.toThrow(/too large/)
    expect(MAX_SOURCE_BYTES).toBeGreaterThan(2048)
  })
})

describe('testFetch', () => {
  it('previews what a source yields without storing anything', async () => {
    stubFetch(rss)
    const result = await testFetch({ type: 'rss', url: 'https://example.com/feed', config: null })
    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ count: 2, undated: 1 })
    expect(result.items.map((i) => i.title)).toEqual(['One', 'Two'])
  })

  it('reports a failure instead of throwing', async () => {
    stubFetch('', { status: 404 })
    const result = await testFetch({ type: 'rss', url: 'https://example.com/feed', config: null })
    expect(result).toMatchObject({ ok: false, count: 0, error: 'FetchError: HTTP 404' })
  })
})

describe('schedule', () => {
  const source = { enabled: true, nextFetchAt: null, intervalMinutes: 30, use: 'editorial' as const, firstFetchedAt: null }

  it('is due when never fetched or when the next fetch time has passed', () => {
    expect(isDue(source, now)).toBe(true)
    expect(isDue({ ...source, nextFetchAt: '2026-10-22T09:59:00Z' }, now)).toBe(true)
    expect(isDue({ ...source, nextFetchAt: '2026-10-22T10:01:00Z' }, now)).toBe(false)
    expect(isDue({ ...source, enabled: false }, now)).toBe(false)
  })

  it('after a success: records the fetch and sets the interval from the last 7 days', () => {
    const patch = afterFetch({ source, now, found: 12, itemsLast7Days: 70 })
    // 10 a day → a check every 36 minutes.
    expect(patch).toMatchObject({
      lastFetchedAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      firstFetchedAt: now.toISOString(),
      lastError: null,
      lastItemCount: 12,
      itemsLast7Days: 70,
      intervalMinutes: 36,
      nextFetchAt: new Date(now.getTime() + 36 * 60_000).toISOString(),
    })
    // The first fetch time is kept once set; a quiet source waits the maximum.
    const quiet = afterFetch({ source: { ...source, firstFetchedAt: '2026-10-01T00:00:00Z' }, now, found: 0, itemsLast7Days: 0 })
    expect(quiet.firstFetchedAt).toBe('2026-10-01T00:00:00Z')
    expect(quiet.intervalMinutes).toBe(INTERVAL_MAX_MINUTES)
    const hot = afterFetch({ source: { ...source, use: 'hot_signal' }, now, found: 0, itemsLast7Days: 0 })
    expect(hot.intervalMinutes).toBe(HOT_SIGNAL_MAX_MINUTES)
  })

  it('after a failure: keeps the error and backs off, within the bound', () => {
    const patch = afterFetch({ source, now, found: 0, itemsLast7Days: 5, error: 'FetchError: HTTP 503' })
    expect(patch).toEqual({
      lastFetchedAt: now.toISOString(),
      lastError: 'FetchError: HTTP 503',
      nextFetchAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    })
    const capped = afterFetch({ source: { ...source, intervalMinutes: 60 }, now, found: 0, itemsLast7Days: 5, error: 'x' })
    expect(capped.nextFetchAt).toBe(new Date(now.getTime() + 60 * 60_000).toISOString())
  })
})

describe('source settings', () => {
  it('validates the URL and the reader settings for each type', () => {
    expect(validateSourceUrl('https://example.com/feed')).toBe(true)
    expect(validateSourceUrl('ftp://example.com')).toMatch(/http/)
    expect(validateSourceUrl('')).toBe('Required.')
    expect(validateSourceConfig('rss', null)).toBe(true)
    expect(validateSourceConfig('html_list', null)).toMatch(/item/)
    expect(validateSourceConfig('html_list', { item: 'article', skipHosts: 'x' })).toMatch(/skipHosts/)
    expect(validateSourceConfig('html_list', { item: 'article' })).toBe(true)
    expect(validateSourceConfig('json', { kind: 'hacker_news', minPoints: 50 })).toBe(true)
    expect(validateSourceConfig('json', { kind: 'reddit' })).toMatch(/kind/)
    expect(validateSourceConfig(undefined, null)).toMatch(/type/)
  })
})

describe('default sources', () => {
  it('is the first batch from the spec, each one valid', () => {
    expect(defaultSources).toHaveLength(16)
    expect(new Set(defaultSources.map((s) => s.name)).size).toBe(16)
    expect(new Set(defaultSources.map((s) => s.url)).size).toBe(16)
    for (const source of defaultSources) {
      expect(validateSourceUrl(source.url), source.name).toBe(true)
      expect(validateSourceConfig(source.type, source.config ?? null), source.name).toBe(true)
      expect(source.intervalMinutes).toBeGreaterThanOrEqual(15)
      if (source.type === 'html_list') {
        // Selectors are unconfirmed until the owner test-fetches them.
        expect(source.enabled, source.name).toBe(false)
        expect(htmlListConfigSchema.safeParse(source.config).success).toBe(true)
      } else {
        expect(source.enabled, source.name).toBe(true)
      }
    }
    expect(defaultSources.filter((s) => s.tier === 'T1')).toHaveLength(10)
    expect(defaultSources.filter((s) => s.use === 'hot_signal').map((s) => s.name)).toEqual(['Hacker News'])
  })
})
