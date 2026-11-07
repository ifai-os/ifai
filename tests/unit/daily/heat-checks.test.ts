import { describe, expect, it } from 'vitest'

import { heatScore, peakHeat, rawHeat } from '@/modules/daily/heat/rules'
import {
  backfillDailyLimit,
  backfillDue,
  backfillSince,
  backfillWindow,
  CHECK_SOURCE_IDS,
  CHECK_WEIGHT_CAP,
  CHECKS_PER_RUN,
  checkSignals,
  checkWeight,
  dailyCheckLimit,
  dueEvents,
  matchesStory,
  postId,
  searchOutlets,
  verifiedPosts,
  worthChecking,
  X_TOP_POSTS,
} from '@/modules/daily/heat/external/rules'

const at = new Date('2026-10-27T12:00:00Z')
const hours = (n: number) => new Date(at.getTime() - n * 3_600_000)

describe('outside reach checks', () => {
  it('weighs a check by what it found, never past the channel cap', () => {
    expect(checkWeight('search', 0)).toBe(0)
    expect(checkWeight('search', 8)).toBe(0.75)
    expect(checkWeight('search', 10_000)).toBeLessThan(CHECK_WEIGHT_CAP.search)
    // X counts the views of the most-viewed posts: half a million weigh one source.
    expect(checkWeight('x', 500_000)).toBe(1)
    expect(checkWeight('x', 5000)).toBeLessThan(0.05)
    expect(checkWeight('x', 1e9)).toBeLessThanOrEqual(CHECK_WEIGHT_CAP.x)
  })

  it('turns checks into one signal source per channel, from when they ran', () => {
    const signals = checkSignals([
      { eventId: 1, kind: 'search', weight: 1, checkedAt: hours(12) },
      { eventId: 1, kind: 'search', weight: 0.5, checkedAt: hours(0) },
      { eventId: 1, kind: 'x', weight: 2, checkedAt: hours(0) },
      { eventId: 2, kind: 'x', weight: 0, checkedAt: hours(0) },
    ])
    expect(signals.get(2)).toBeUndefined()
    const one = signals.get(1) ?? []
    expect(new Set(one.map((signal) => signal.sourceId))).toEqual(new Set([CHECK_SOURCE_IDS.search, CHECK_SOURCE_IDS.x]))
    // Each channel counts once: the older search (1 halved by 12 hours ≈ 0.71) beats the newer 0.5.
    expect(rawHeat(one, at)).toBeCloseTo(2 + 0.5 ** 0.5)
    // Both channels together stay well short of a full index.
    expect(heatScore(rawHeat([...one, ...one], at))).toBeLessThan(60)
    expect(peakHeat(one)).toBeGreaterThan(0)
  })

  it('checks each event worth it once, hottest first, within the room left', () => {
    const event = (eventId: number, heat: number, extra: Partial<{ checked: boolean; importance: number; reach: number; publishedAt: Date }> = {}) => ({
      eventId,
      heat,
      checked: false,
      importance: 60,
      reach: 22,
      publishedAt: hours(30),
      ...extra,
    })
    const list = [
      event(1, 30),
      event(2, 80, { checked: true }),
      event(3, 60, { importance: 30, reach: 53 }), // not important, but already spreading
      event(4, 90),
      event(5, 95, { importance: 40, reach: 22 }), // neither: not checked
    ]
    expect(dueEvents('search', list, 10, at)).toEqual([4, 3, 1])
    expect(dueEvents('search', list, 2, at)).toEqual([4, 3])
    expect(dueEvents('search', list, 0, at)).toEqual([])
    // X waits until a story is a day old.
    expect(dueEvents('x', [event(1, 30), event(4, 90, { publishedAt: hours(10) })], 10, at)).toEqual([1])
    expect(dueEvents('search', [event(4, 90, { publishedAt: hours(10) })], 10, at)).toEqual([4])
    const many = Array.from({ length: 40 }, (_, i) => event(i + 1, i))
    expect(dueEvents('search', many, 100, at)).toHaveLength(CHECKS_PER_RUN)
  })

  it('tells which stories are worth an outside check', () => {
    expect(worthChecking({ importance: 100, reach: 0 })).toBe(true)
    expect(worthChecking({ importance: 55, reach: 0 })).toBe(true)
    expect(worthChecking({ importance: 40, reach: 39 })).toBe(true)
    expect(worthChecking({ importance: 40, reach: 22 })).toBe(false)
    expect(worthChecking({ importance: null, reach: null })).toBe(false)
  })

  it('reads the daily caps from the environment', () => {
    expect(dailyCheckLimit('search', {})).toBe(60)
    expect(dailyCheckLimit('x', {})).toBe(40)
    expect(dailyCheckLimit('x', { HEAT_X_DAILY_LIMIT: '5' })).toBe(5)
    expect(dailyCheckLimit('search', { HEAT_SEARCH_DAILY_LIMIT: 'lots' })).toBe(60)
  })

  it('counts only outlets whose results are about the story', () => {
    const subject = { eventId: 1, title: 'Lumen Chat adds shared team workspaces', topic: 'Lumen Chat' }
    const outlets = searchOutlets(subject, [
      { url: 'https://www.verge.com/a', title: 'Lumen Chat gets team workspaces', description: '' },
      { url: 'https://verge.com/b', title: 'More on Lumen Chat', description: '' },
      { url: 'https://example.org/c', title: 'Other AI news', description: 'Nothing to do with it' },
      { url: 'not a url', title: 'Lumen Chat', description: '', hostname: 'news.example.com' },
    ])
    expect(outlets).toEqual(['news.example.com', 'verge.com'])
    // Without a topic, half of the title's words have to match.
    const plain = { eventId: 2, title: 'Open weights for the Kitecode coding model', topic: null }
    expect(matchesStory(plain, 'Kitecode releases open weights')).toBe(true)
    expect(matchesStory(plain, 'A coding assistant review')).toBe(false)
  })

  it('adds up the views of the five most-viewed posts the search really cited, each once', () => {
    expect(postId('https://twitter.com/a/status/123?s=20')).toBe('123')
    expect(postId('https://example.com/a/status/123')).toBeNull()
    const { posts, views } = verifiedPosts(
      [
        { url: 'https://x.com/a/status/1', views: 5000 },
        { url: 'https://twitter.com/a/status/1', views: 5000 },
        { url: 'https://x.com/b/status/2', views: 900_000 }, // not cited
        { url: 'https://x.com/c/status/3', views: 0 }, // no count shown
        { url: 'https://x.com/d/status/4', views: 20_000.4 },
      ],
      ['https://x.com/a/status/1', 'https://x.com/c/status/3', 'https://x.com/d/status/4'],
    )
    expect(posts.map((post) => post.url)).toEqual(['https://x.com/d/status/4', 'https://x.com/a/status/1'])
    expect(views).toBe(25_000)
    const cited = Array.from({ length: 8 }, (_, i) => `https://x.com/u/status/${i + 10}`)
    const top = verifiedPosts(
      cited.map((url, i) => ({ url, views: (i + 1) * 1000 })),
      cited,
    )
    expect(top.posts).toHaveLength(X_TOP_POSTS)
    expect(top.views).toBe((8 + 7 + 6 + 5 + 4) * 1000)
  })
})

describe('catching up on older stories', () => {
  const now = new Date('2026-11-04T16:00:00Z')
  const since = new Date('2026-01-01T00:00:00Z')
  const story = (eventId: number, at: string, importance = 60, reach = 22) => ({ eventId, publishedAt: new Date(at), importance, reach })

  it('takes stories from the start day until 48 hours ago, unchecked, newest first, each event once', () => {
    const stories = [
      story(1, '2026-03-01T10:00:00Z'),
      story(2, '2026-11-01T10:00:00Z'),
      story(3, '2026-11-03T10:00:00Z'), // within 48 hours: the regular checks take it
      story(4, '2025-12-31T23:00:00Z'), // before the start
      story(5, '2026-10-20T10:00:00Z'), // already checked
      story(2, '2026-10-31T10:00:00Z'), // the same event again
      story(6, '2026-06-01T10:00:00Z'),
      story(7, '2026-07-01T10:00:00Z', 30, 22), // not worth an outside check
    ]
    expect(backfillDue(stories, new Set([5]), since, now, 10).map((s) => s.eventId)).toEqual([2, 6, 1])
    expect(backfillDue(stories, new Set([5]), since, now, 2).map((s) => s.eventId)).toEqual([2, 6])
    expect(backfillDue(stories, new Set(), since, now, 0)).toEqual([])
  })

  it('searches the story day and the two after it', () => {
    expect(backfillWindow(new Date('2026-10-31T07:00:00Z'))).toEqual({ from: '2026-10-31', to: '2026-11-02' })
  })

  it('reads its start day and daily shares from the environment', () => {
    expect(backfillSince({}).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(backfillSince({ HEAT_BACKFILL_SINCE: '2025-06-01' }).toISOString()).toBe('2025-06-01T00:00:00.000Z')
    expect(backfillSince({ HEAT_BACKFILL_SINCE: 'soon' }).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    // No Grok for stories before November 2026.
    expect(backfillSince({}, 'x').toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(backfillSince({ HEAT_BACKFILL_SINCE: '2026-11-03' }, 'x').toISOString()).toBe('2026-11-03T00:00:00.000Z')
    expect(backfillDailyLimit('search', {})).toBe(100)
    expect(backfillDailyLimit('x', {})).toBe(50)
    expect(backfillDailyLimit('x', { HEAT_X_BACKFILL_DAILY_LIMIT: '0' })).toBe(0)
    expect(backfillDailyLimit('search', { HEAT_SEARCH_BACKFILL_DAILY_LIMIT: 'lots' })).toBe(100)
  })

  it('adds to the reach index from when the story came out, not to the heat of today', () => {
    const published = new Date('2026-10-01T08:00:00Z')
    const signals = [{ sourceId: 1, at: published, knownAt: published, weight: 1 }, ...(checkSignals([{ eventId: 7, kind: 'search', weight: 1.5, checkedAt: published }]).get(7) ?? [])]
    expect(peakHeat(signals)).toBe(heatScore(2.5))
    expect(rawHeat(signals, now)).toBe(0)
  })
})
