import { describe, expect, it } from 'vitest'

import {
  appearedAt,
  contribution,
  eventHeat,
  heatScore,
  hotWeight,
  rawHeat,
  signalsOf,
  trendOf,
  type HeatMember,
  type HeatSignal,
} from '@/modules/daily/heat/rules'
import { hotSignalRows } from '@/modules/daily/heat/signals'
import {
  planSources,
  storyFor,
  withNewSources,
  type MemberReport,
  type SourceEntry,
  type StoryRef,
} from '@/modules/daily/heat/source-plan'
import type { FoundItem } from '@/modules/daily/types'

const now = new Date('2026-10-23T12:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)

const signal = (sourceId: number, hours: number, overrides: Partial<HeatSignal> = {}): HeatSignal => ({
  sourceId,
  at: hoursAgo(hours),
  knownAt: hoursAgo(hours),
  weight: 1,
  ...overrides,
})

describe('event heat', () => {
  it('halves a source every 24 hours and drops it after 48', () => {
    expect(contribution(signal(1, 0), now)).toBe(1)
    expect(contribution(signal(1, 24), now)).toBeCloseTo(0.5)
    expect(contribution(signal(1, 47), now)).toBeGreaterThan(0.25)
    expect(contribution(signal(1, 49), now)).toBe(0)
  })

  it('ignores what had not appeared, or was not known, at that time', () => {
    expect(contribution(signal(1, -1), now)).toBe(0)
    expect(contribution(signal(1, 10, { knownAt: hoursAgo(-1) }), now)).toBe(0)
  })

  it('counts each source once, with its strongest signal', () => {
    expect(rawHeat([signal(1, 0), signal(1, 24), signal(1, 2)], now)).toBe(1)
    expect(rawHeat([signal(1, 0), signal(2, 24)], now)).toBeCloseTo(1.5)
    expect(rawHeat([signal(1, 24), signal(1, 0, { weight: 2 })], now)).toBe(2)
  })

  it('puts the sum on a 0–100 scale that fills up and never passes 100', () => {
    expect(heatScore(0)).toBe(0)
    expect(heatScore(1)).toBe(22.1)
    expect(heatScore(5)).toBe(71.3)
    expect(heatScore(10)).toBe(91.8)
    expect(heatScore(1000)).toBe(100)
  })

  it('marks an event new when it had no heat 6 hours ago, rising when it gained a point', () => {
    expect(trendOf(0, 0)).toBeNull()
    expect(trendOf(22.1, 0)).toBe('new')
    expect(trendOf(40, 38.9)).toBe('rising')
    expect(trendOf(40, 39.5)).toBeNull()
    expect(trendOf(30, 40)).toBeNull()
  })

  it('compares with the heat of 6 hours ago from what was known then', () => {
    // Three reports in the last two hours: nothing was known 6 hours ago.
    expect(eventHeat([signal(1, 1), signal(2, 2), signal(3, 0.5)], now).trend).toBe('new')
    // One report 10 hours ago, two more since: rising.
    const rising = eventHeat([signal(1, 10), signal(2, 3), signal(3, 1)], now)
    expect(rising.before).toBe(heatScore(0.5 ** (4 / 24)))
    expect(rising.heat).toBeGreaterThan(rising.before + 1)
    expect(rising.trend).toBe('rising')
    // A report found an hour ago that was published 10 hours ago did not count 6 hours ago.
    expect(eventHeat([signal(1, 10, { knownAt: hoursAgo(1) })], now).before).toBe(0)
    // Only fading: no mark.
    expect(eventHeat([signal(1, 20), signal(2, 22)], now).trend).toBeNull()
  })

  it('weighs a hot signal by its points, up to double at 500', () => {
    expect(hotWeight(undefined)).toBe(1)
    expect(hotWeight(-5)).toBe(1)
    expect(hotWeight(250)).toBe(1.5)
    expect(hotWeight(5000)).toBe(2)
  })

  it('dates a report by its published time unless that is missing or after we found it', () => {
    expect(appearedAt(hoursAgo(5), hoursAgo(1))).toEqual(hoursAgo(5))
    expect(appearedAt(null, hoursAgo(1))).toEqual(hoursAgo(1))
    expect(appearedAt(hoursAgo(-2), hoursAgo(1))).toEqual(hoursAgo(1))
  })
})

describe('signals of an event', () => {
  const member = (overrides: Partial<HeatMember> & Pick<HeatMember, 'itemId' | 'sourceId'>): HeatMember => ({
    eventId: 1,
    relation: 'same',
    publishedAt: hoursAgo(3),
    discoveredAt: hoursAgo(2),
    points: null,
    ...overrides,
  })
  const hot = (sourceId: number) => sourceId === 9

  it('takes each report from its source and each hot thread about a report', () => {
    const signals = signalsOf(
      [member({ itemId: 1, sourceId: 1 }), member({ itemId: 2, sourceId: 2, eventId: 2 })],
      [{ itemId: 1, sourceId: 9, points: 250, postedAt: hoursAgo(1), firstSeenAt: hoursAgo(0.5) }],
      hot,
    )
    expect(signals.get(1)).toEqual([
      { sourceId: 1, at: hoursAgo(3), knownAt: hoursAgo(2), weight: 1 },
      { sourceId: 9, at: hoursAgo(1), knownAt: hoursAgo(0.5), weight: 1.5 },
    ])
    expect(signals.get(2)).toHaveLength(1)
  })

  it("weighs a hot source's own report by its best points", () => {
    const signals = signalsOf(
      [member({ itemId: 1, sourceId: 9, points: 100 })],
      [{ itemId: 1, sourceId: 9, points: 400, postedAt: hoursAgo(3), firstSeenAt: hoursAgo(2) }],
      hot,
    )
    expect(signals.get(1)?.[0].weight).toBe(1.8)
  })

  it('leaves out the discussion of a digest', () => {
    const signals = signalsOf(
      [member({ itemId: 1, sourceId: 3, relation: 'roundup' })],
      [{ itemId: 1, sourceId: 9, points: 500, postedAt: hoursAgo(1), firstSeenAt: hoursAgo(1) }],
      hot,
    )
    expect(signals.get(1)?.map((item) => item.sourceId)).toEqual([3])
  })
})

describe('Hacker News evidence', () => {
  const found = (url: string, extra: Partial<FoundItem> = {}): FoundItem => ({ url, title: url, ...extra })

  it('keeps links we have, with points, comments or a thread, once per report with its best numbers', () => {
    const rows = hotSignalRows(
      [
        found('https://a.example/1', { signals: { points: 120.4, comments: 30 }, discussionUrl: 'https://news.ycombinator.com/item?id=1', publishedAt: hoursAgo(2) }),
        found('https://a.example/1', { signals: { points: 10 } }),
        found('https://a.example/2', { signals: { points: -3 }, publishedAt: hoursAgo(-1) }),
        found('https://a.example/3'),
        found('https://unknown.example/', { signals: { points: 900 } }),
      ],
      new Map([
        ['https://a.example/1', 11],
        ['https://a.example/2', 12],
        ['https://a.example/3', 13],
      ]),
      9,
      now,
    )
    expect(rows.map((row) => [row.itemId, row.points, row.comments, row.discussionUrl ?? null])).toEqual([
      [11, 120, 30, 'https://news.ycombinator.com/item?id=1'],
      [12, 0, 0, null],
    ])
    expect(rows[0].postedAt).toEqual(hoursAgo(2))
    // A submission time in the future is taken as now.
    expect(rows[1].postedAt).toEqual(now)
  })
})

describe("joining later reports to a story's sources", () => {
  const report = (itemId: number, overrides: Partial<MemberReport> = {}): MemberReport => ({
    itemId,
    relation: 'same',
    matchedItemId: null,
    sourceName: `Outlet ${itemId}`,
    url: `https://outlet${itemId}.example/story`,
    publishedAt: hoursAgo(2),
    ...overrides,
  })
  const entry = (itemId: number, role: SourceEntry['role'] = 'report'): SourceEntry => ({
    name: `Outlet ${itemId}`,
    role,
    url: `https://outlet${itemId}.example/story`,
    publishedAt: hoursAgo(2).toISOString(),
  })
  const url = (itemId: number) => `https://outlet${itemId}.example/story`
  const story = (overrides: Partial<StoryRef> & Pick<StoryRef, 'id' | 'representativeItemId'>): StoryRef => ({
    createdAt: hoursAgo(5),
    seen: [],
    sources: [{ ...entry(overrides.representativeItemId), role: 'original' }],
    ...overrides,
  })

  it('follows "same as" links back to the story of that report', () => {
    const members = new Map([
      [3, report(3, { matchedItemId: 2 })],
      [2, report(2, { relation: 'follow_up' })],
      [4, report(4, { matchedItemId: 3 })],
    ])
    const main = story({ id: 10, representativeItemId: 1 })
    const followUp = story({ id: 20, representativeItemId: 2 })
    const byReport = new Map([
      [1, main],
      [2, followUp],
    ])
    expect(storyFor(4, members, byReport, main)).toBe(followUp)
    expect(storyFor(5, members, byReport, main)).toBe(main)
  })

  it('adds new reports before the discussion threads and new threads at the end', () => {
    const current = [entry(1, 'original'), entry(2), { name: 'Hacker News', role: 'discussion' as const, url: 'https://hn.example/1', publishedAt: null }]
    expect(withNewSources(current, [entry(3), entry(2)], [{ name: 'Lobsters', role: 'discussion', url: 'https://lobste.example/1', publishedAt: null }])?.map((s) => s.url)).toEqual([
      url(1),
      url(2),
      url(3),
      'https://hn.example/1',
      'https://lobste.example/1',
    ])
    expect(withNewSources(current, [entry(2)], [])).toBeNull()
  })

  it('places each later report and thread on the right story and remembers what it offered', () => {
    const plans = planSources({
      members: [
        report(1),
        report(2, { relation: 'follow_up' }),
        report(3),
        report(4, { matchedItemId: 2 }),
        report(5, { relation: 'roundup' }),
      ],
      threads: [
        { itemId: 1, sourceName: 'Hacker News', url: 'https://hn.example/1' },
        { itemId: 5, sourceName: 'Hacker News', url: 'https://hn.example/5' },
      ],
      stories: [story({ id: 10, representativeItemId: 1 }), story({ id: 20, representativeItemId: 2 })],
      eventReportId: 1,
    })
    expect(plans).toEqual([
      {
        storyId: 10,
        sources: [
          { ...entry(1), role: 'original' },
          entry(3),
          { name: 'Hacker News', role: 'discussion', url: 'https://hn.example/1', publishedAt: null },
        ],
        seen: [url(3), 'https://hn.example/1'],
      },
      { storyId: 20, sources: [{ ...entry(2), role: 'original' }, entry(4)], seen: [url(4)] },
    ])
  })

  it('does not bring back a source the editor removed', () => {
    // Report 3 was offered before; the editor has since taken it off the list.
    const stories = [story({ id: 10, representativeItemId: 1, seen: [url(3)] })]
    expect(planSources({ members: [report(1), report(3)], threads: [], stories, eventReportId: 1 })).toEqual([])
    // A report that was not there at the last check still joins.
    expect(planSources({ members: [report(1), report(3), report(4)], threads: [], stories, eventReportId: 1 })).toEqual([
      { storyId: 10, sources: [{ ...entry(1), role: 'original' }, entry(4)], seen: [url(3), url(4)] },
    ])
  })

  it('looks at every report on the first check, skipping the ones already listed', () => {
    const plans = planSources({
      members: [report(1), report(3), report(4)],
      threads: [],
      stories: [story({ id: 10, representativeItemId: 1, seen: null, sources: [{ ...entry(1), role: 'original' }, entry(3)] })],
      eventReportId: 1,
    })
    expect(plans).toEqual([{ storyId: 10, sources: [{ ...entry(1), role: 'original' }, entry(3), entry(4)], seen: [url(3), url(4)] }])
    // Nothing to remember yet still marks the first check as done.
    expect(planSources({ members: [report(1)], threads: [], stories: [story({ id: 10, representativeItemId: 1, seen: null })], eventReportId: 1 })).toEqual([
      { storyId: 10, sources: null, seen: [] },
    ])
  })
})
