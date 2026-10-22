import { describe, expect, it } from 'vitest'

import { clientIp, isCountedVisit, visitorHash } from '@/lib/visitor'
import { percentileScores, rankScore, risingMinimumHeat, scoreApps, type HeatInput } from '@/modules/apps/heat'
import { addDays, shanghaiMidnight } from '@/modules/apps/metrics/days'
import { isOnSite, trancoCandidates, trancoRankOf } from '@/modules/apps/metrics/domains'
import { matchMentions, namesApp, normalizeName, type MentionStory, type MentionTarget } from '@/modules/apps/metrics/match'
import { fetchTrancoRanks, TrancoError, trancoListDate } from '@/modules/apps/metrics/tranco'

describe('rankScore', () => {
  it('scales the Tranco rank to 0–50 on a log scale', () => {
    expect(rankScore(1)).toBe(50)
    expect(rankScore(1000)).toBe(25)
    expect(rankScore(1_000_000)).toBe(0)
    expect(rankScore(2_000_000)).toBe(0)
    expect(rankScore(null)).toBe(0)
  })
})

describe('percentileScores', () => {
  it('scores zero as zero and the busiest app the full score', () => {
    const counts = Array.from({ length: 20 }, (_, index) => index)
    const scores = percentileScores(counts, 30)
    expect(scores[0]).toBe(0)
    expect(scores[19]).toBe(30)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('takes the share of at least ten apps, so a few clicks cannot earn everything', () => {
    expect(percentileScores([5, 0, 0], 30)).toEqual([3, 0, 0])
    expect(percentileScores([1, 2], 20)).toEqual([2, 4])
  })

  it('gives equal counts equal scores', () => {
    const scores = percentileScores([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1], 30)
    expect(new Set(scores.slice(0, 10)).size).toBe(1)
    expect(scores[0]).toBe(30)
    expect(scores[10]).toBe(3)
  })
})

function input(appId: number, values: Partial<HeatInput> = {}): HeatInput {
  return {
    appId,
    name: `App ${appId}`,
    categoryId: 1,
    trancoRank: null,
    clicks: 0,
    saves: 0,
    mentions: 0,
    heatBefore: null,
    ...values,
  }
}

describe('scoreApps', () => {
  it('adds the three whole-number parts up to the heat', () => {
    const inputs = Array.from({ length: 30 }, (_, index) =>
      input(index + 1, { trancoRank: index * 997 + 1, clicks: (index * 7) % 13, mentions: index % 4 }),
    )
    for (const result of scoreApps(inputs)) {
      expect(result.heat).toBe(result.rankScore + result.engagementScore + result.mentionScore)
      expect(Number.isInteger(result.rankScore) && Number.isInteger(result.engagementScore)).toBe(true)
      expect(result.heat).toBeLessThanOrEqual(100)
    }
  })

  it('ranks by heat, then Tranco rank, then clicks, then name', () => {
    const results = scoreApps([
      input(1, { name: 'Beta' }),
      input(2, { name: 'Alpha' }),
      input(3, { trancoRank: 1 }),
      input(4, { trancoRank: 5_000_000 }),
    ])
    const place = (appId: number) => results.find((result) => result.appId === appId)?.rankOverall
    expect(place(3)).toBe(1)
    // Same heat (0): a rank outside the list still beats none, then the name decides.
    expect([place(4), place(2), place(1)]).toEqual([2, 3, 4])
  })

  it('ranks within each primary category', () => {
    const results = scoreApps([
      input(1, { categoryId: 1, trancoRank: 10 }),
      input(2, { categoryId: 2, trancoRank: 20 }),
      input(3, { categoryId: 1, trancoRank: 30 }),
      input(4, { categoryId: null, trancoRank: 1 }),
    ])
    const byId = new Map(results.map((result) => [result.appId, result]))
    expect(byId.get(1)?.rankCategory).toBe(1)
    expect(byId.get(3)?.rankCategory).toBe(2)
    expect(byId.get(2)?.rankCategory).toBe(1)
    expect(byId.get(4)?.rankCategory).toBeNull()
  })

  it('puts only apps with enough heat that went up on the rising board', () => {
    const results = scoreApps([
      input(1, { trancoRank: 10, heatBefore: 20 }), // heat 42, +22
      input(2, { trancoRank: 100, heatBefore: 30 }), // heat 33, +3
      input(3, { trancoRank: 100_000, heatBefore: 1 }), // heat 8: too small a base
      input(4, { trancoRank: 10, heatBefore: 50 }), // went down
      input(5, { trancoRank: 10 }), // new: no change yet
    ])
    const byId = new Map(results.map((result) => [result.appId, result]))
    expect(byId.get(1)?.heat).toBeGreaterThanOrEqual(risingMinimumHeat)
    expect(byId.get(1)?.change7d).toBe(byId.get(1)!.heat - 20)
    expect(byId.get(1)?.rankRising).toBe(1)
    expect(byId.get(2)?.rankRising).toBe(2)
    expect(byId.get(3)?.rankRising).toBeNull()
    expect(byId.get(4)?.rankRising).toBeNull()
    expect(byId.get(5)?.change7d).toBeNull()
    expect(byId.get(5)?.rankRising).toBeNull()
  })
})

describe('Tranco domains', () => {
  const ranks = { 'deepseek.com': 2000, 'google.com': 1, 'github.com': 30, 'canva.com': 90, 'example.ai': 5000 }

  it('looks the app up by its registered domain', () => {
    expect(trancoCandidates({ domain: 'chat.deepseek.com' })).toEqual(['chat.deepseek.com', 'deepseek.com'])
    expect(trancoRankOf({ domain: 'chat.deepseek.com', website: 'https://chat.deepseek.com/' }, ranks)).toEqual({
      domain: 'deepseek.com',
      rank: 2000,
    })
    expect(trancoRankOf({ domain: 'www.example.ai' }, ranks)).toEqual({ domain: 'example.ai', rank: 5000 })
    expect(trancoRankOf({ domain: 'missing.ai' }, ranks)).toBeNull()
    expect(trancoRankOf({ domain: null }, ranks)).toBeNull()
  })

  it('gives no rank to pages and subdomains of shared hosts', () => {
    expect(trancoRankOf({ domain: 'gemini.google.com', website: 'https://gemini.google.com/app' }, ranks)).toBeNull()
    expect(trancoRankOf({ domain: 'github.com', website: 'https://github.com/owner/repo' }, ranks)).toBeNull()
    expect(trancoRankOf({ domain: 'github.com', website: 'https://github.com/' }, ranks)).toEqual({ domain: 'github.com', rank: 30 })
    // A product page on the company's own site keeps the company's rank.
    expect(trancoRankOf({ domain: 'canva.com', website: 'https://www.canva.com/magic/' }, ranks)).toEqual({ domain: 'canva.com', rank: 90 })
  })

  it('matches links on the site, or under the page for an app that is a page', () => {
    const site = { domain: 'kitecode.example', website: 'https://kitecode.example/en' }
    expect(isOnSite('https://kitecode.example/blog/launch', site)).toBe(true)
    expect(isOnSite('https://docs.kitecode.example/', site)).toBe(true)
    expect(isOnSite('https://notkitecode.example/', site)).toBe(false)

    const repo = { domain: 'github.com', website: 'https://github.com/Owner/Repo' }
    expect(isOnSite('https://github.com/owner/repo/releases/tag/v1', repo)).toBe(true)
    expect(isOnSite('https://github.com/owner/other', repo)).toBe(false)

    const page = { domain: 'canva.com', website: 'https://www.canva.com/en/magic/' }
    expect(isOnSite('https://canva.com/magic/news', page)).toBe(true)
    expect(isOnSite('https://canva.com/pricing', page)).toBe(false)

    // The shared host itself is matched by name only.
    expect(isOnSite('https://github.com/anyone/anything', { domain: 'github.com', website: 'https://github.com' })).toBe(false)
    expect(isOnSite('javascript:alert(1)', site)).toBe(false)
  })
})

describe('mention matching', () => {
  it('normalizes punctuation, case and width', () => {
    expect(normalizeName('Character.AI')).toBe('character ai')
    expect(normalizeName('ＧＰＴ-4o')).toBe('gpt 4o')
  })

  it('accepts the name, the name with more words, and the maker in front', () => {
    expect(namesApp('claude', 'claude', null)).toBe(true)
    expect(namesApp('claude opus 4 5', 'claude', null)).toBe(true)
    expect(namesApp('claudette', 'claude', null)).toBe(false)
    expect(namesApp('google gemini', 'gemini', 'google')).toBe(true)
    expect(namesApp('google gemini 2 5 pro', 'gemini', 'google')).toBe(true)
    expect(namesApp('vo 3', 'vo', null)).toBe(false)
    expect(namesApp('阿里通义千问', '通义千问', null)).toBe(true)
  })

  const apps: MentionTarget[] = [
    { id: 1, name: 'Kitecode', aliases: ['Kite'], developer: 'Kite Labs', domain: 'kitecode.example', website: 'https://kitecode.example' },
    { id: 2, name: 'Lumen Chat', aliases: [], developer: null, domain: 'lumen.example', website: 'https://lumen.example' },
  ]
  const story = (id: number, names: string[], urls: string[] = []): MentionStory => ({
    id,
    eventId: id * 10,
    publishedAt: '2026-10-20T01:00:00.000Z',
    names,
    urls,
  })

  it('finds each app once per story, by name before alias before link', () => {
    const mentions = matchMentions(
      [
        story(1, ['Kitecode 2', 'Kite'], ['https://kitecode.example/blog']),
        story(2, ['Kite'], []),
        story(3, ['Someone else'], ['https://www.lumen.example/news']),
        story(4, ['Lumenary'], ['https://elsewhere.example/']),
      ],
      apps,
    )
    expect(mentions.map(({ appId, storyId, basis, matched }) => ({ appId, storyId, basis, matched }))).toEqual([
      { appId: 1, storyId: 1, basis: 'name', matched: 'Kitecode 2' },
      { appId: 1, storyId: 2, basis: 'alias', matched: 'Kite' },
      { appId: 2, storyId: 3, basis: 'domain', matched: 'https://www.lumen.example/news' },
    ])
    expect(mentions[0].eventId).toBe(10)
  })
})

describe('Shanghai days', () => {
  it('counts calendar days and finds where a Shanghai day starts', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(shanghaiMidnight('2026-10-22').toISOString()).toBe('2026-10-21T16:00:00.000Z')
  })
})

/** A Tranco download of `total` lines, made as it is read, with `first` at the top. */
function listBody(total: number, first: string[] = [], onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let line = 0
  return new ReadableStream({
    pull(controller) {
      const chunk: string[] = []
      for (let index = 0; index < 20_000 && line < total; index++) {
        line++
        chunk.push(`${line},${first[line - 1] ?? `site-${line}.example`}`)
      }
      if (chunk.length === 0) controller.close()
      else controller.enqueue(encoder.encode(`${chunk.join('\n')}\n`))
    },
    cancel() {
      onCancel?.()
    },
  })
}

function trancoFetch(list: () => ReadableStream<Uint8Array> | Response, id = 'K25JW') {
  const requested: string[] = []
  const fetchFn = (async (input: string | URL | Request) => {
    const url = input.toString()
    requested.push(url)
    if (url.includes('/daily_list_id')) return new Response(id)
    if (url.endsWith(`/download/${id}/1000000`)) {
      const body = list()
      return body instanceof Response ? body : new Response(body)
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  return { fetchFn, requested }
}

describe('fetchTrancoRanks', () => {
  const now = new Date('2026-10-22T22:00:00Z')

  it('asks for yesterday’s list (UTC)', () => {
    expect(trancoListDate(now)).toBe('2026-10-21')
  })

  it('stops reading once every domain is found', async () => {
    let cancelled = false
    const { fetchFn, requested } = trancoFetch(() =>
      listBody(1_000_000, ['google.com', 'kitecode.example', 'lumen.example'], () => {
        cancelled = true
      }),
    )
    const result = await fetchTrancoRanks(['Kitecode.example', 'lumen.example'], { fetch: fetchFn, now })
    expect(result).toEqual({ listId: 'K25JW', ranks: { 'kitecode.example': 2, 'lumen.example': 3 } })
    expect(cancelled).toBe(true)
    expect(requested[0]).toBe('https://tranco-list.eu/daily_list_id?date=2026-10-21&subdomains=false')
  })

  it('reads the whole list when some domains are not in it', async () => {
    const { fetchFn } = trancoFetch(() => listBody(1_000_000, ['google.com', 'kitecode.example']))
    const result = await fetchTrancoRanks(['kitecode.example', 'site-999999.example', 'nowhere.example'], { fetch: fetchFn, now })
    expect(result.ranks).toEqual({ 'kitecode.example': 2, 'site-999999.example': 999_999 })
  })

  it('fails on a cut-off download, a missing list or an error', async () => {
    await expect(
      fetchTrancoRanks(['nowhere.example'], { fetch: trancoFetch(() => listBody(5000)).fetchFn, now }),
    ).rejects.toThrow(/stopped after 5000 lines/)
    await expect(
      fetchTrancoRanks(['nowhere.example'], { fetch: trancoFetch(() => listBody(10), '<html>').fetchFn, now }),
    ).rejects.toBeInstanceOf(TrancoError)
    await expect(
      fetchTrancoRanks(['nowhere.example'], {
        fetch: trancoFetch(() => new Response('busy', { status: 503 })).fetchFn,
        now,
      }),
    ).rejects.toThrow(/HTTP 503/)
  })

  it('only looks up the list id when there are no domains', async () => {
    const { fetchFn, requested } = trancoFetch(() => listBody(10))
    expect(await fetchTrancoRanks([], { fetch: fetchFn, now })).toEqual({ listId: 'K25JW', ranks: {} })
    expect(requested).toHaveLength(1)
  })
})

describe('visitor hash', () => {
  const visit = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0', day: '2026-10-22', secret: 'secret' }

  it('is the same for a visitor within a day and different across days', () => {
    expect(visitorHash(visit)).toBe(visitorHash({ ...visit }))
    expect(visitorHash(visit)).toHaveLength(32)
    expect(visitorHash(visit)).not.toBe(visitorHash({ ...visit, day: '2026-10-23' }))
    expect(visitorHash(visit)).not.toBe(visitorHash({ ...visit, userAgent: 'Other' }))
    expect(visitorHash(visit)).not.toBe(visitorHash({ ...visit, secret: 'other' }))
    expect(visitorHash(visit)).not.toContain('203.0.113.7')
  })

  it('reads the client address from the proxy headers', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientIp(new Headers())).toBe('')
  })

  it('counts people opening the page, not bots or prefetches', () => {
    const request = (headers: Record<string, string>, method = 'GET') =>
      new Request('https://ifai.example/en/apps/kitecode/visit', { method, headers })
    const browser = { 'user-agent': 'Mozilla/5.0' }
    expect(isCountedVisit(request(browser), false)).toBe(true)
    expect(isCountedVisit(request(browser), true)).toBe(false)
    expect(isCountedVisit(request(browser, 'HEAD'), false)).toBe(false)
    expect(isCountedVisit(request({}), false)).toBe(false)
    expect(isCountedVisit(request({ ...browser, 'sec-purpose': 'prefetch;prerender' }), false)).toBe(false)
    expect(isCountedVisit(request({ ...browser, purpose: 'prefetch' }), false)).toBe(false)
    expect(isCountedVisit(request({ ...browser, 'next-router-prefetch': '1' }), false)).toBe(false)
  })
})
