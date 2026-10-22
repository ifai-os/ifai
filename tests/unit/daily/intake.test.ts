import { describe, expect, it } from 'vitest'

import { FIRST_IMPORT_LIMIT, nextIntervalMinutes, triage } from '@/modules/daily/intake'
import type { FoundItem } from '@/modules/daily/types'

const now = new Date('2026-10-22T12:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000)
const item = (n: number, publishedAt?: Date): FoundItem => ({ url: `https://example.com/${n}`, title: `Item ${n}`, publishedAt })

describe('triage', () => {
  it('skips known and repeated links, archives anything older than 48 hours', () => {
    const found = [item(1, hoursAgo(1)), item(1, hoursAgo(1)), item(2, hoursAgo(47)), item(3, hoursAgo(49)), item(4), item(5, hoursAgo(2))]
    const result = triage(found, { now, known: new Set(['https://example.com/5']), firstImport: false })
    expect(result.fresh.map((i) => i.url)).toEqual(['https://example.com/1', 'https://example.com/2', 'https://example.com/4'])
    expect(result.archive.map((i) => i.url)).toEqual(['https://example.com/3'])
  })

  it('archives a new source’s first fetch, newest 30 only', () => {
    const found = Array.from({ length: 40 }, (_, i) => item(i, hoursAgo(i)))
    const result = triage(found, { now, known: new Set(), firstImport: true })
    expect(result.fresh).toEqual([])
    expect(result.archive).toHaveLength(FIRST_IMPORT_LIMIT)
    expect(result.archive[0].url).toBe('https://example.com/0')
    expect(result.archive.at(-1)?.url).toBe('https://example.com/29')
  })
})

describe('nextIntervalMinutes', () => {
  it('fetches more often the more a source produces, within the spec’s bounds', () => {
    expect(nextIntervalMinutes(0, 'editorial')).toBe(60)
    expect(nextIntervalMinutes(7 * 6, 'editorial')).toBe(60)
    expect(nextIntervalMinutes(7 * 12, 'editorial')).toBe(30)
    expect(nextIntervalMinutes(7 * 100, 'editorial')).toBe(15)
    expect(nextIntervalMinutes(0, 'hot_signal')).toBe(180)
    expect(nextIntervalMinutes(7, 'hot_signal')).toBe(180)
    expect(nextIntervalMinutes(7 * 12, 'hot_signal')).toBe(30)
  })
})
