import { describe, expect, it } from 'vitest'

import { daysSince, listedSince, orderApps, type Board, type Candidate, type ListHeat, type Sort } from '@/modules/apps/boards'
import { newSince, showTrancoRank } from '@/modules/apps/settings'

const now = new Date('2026-10-23T02:00:00.000Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

// Alpha leads on heat, Bravo is rising, Charlie is new and not in the Tranco list,
// Delta was published after the last heat run, Echo was listed long ago with no date.
const apps: Candidate[] = [
  { id: 1, name: 'Alpha', listedAt: daysAgo(90) },
  { id: 2, name: 'Bravo', listedAt: daysAgo(20) },
  { id: 3, name: 'Charlie', listedAt: daysAgo(2) },
  { id: 4, name: 'Delta', listedAt: daysAgo(1) },
  { id: 5, name: 'Echo', listedAt: null },
]
const heat: Record<number, ListHeat> = {
  1: { heat: 60, change7d: -4, rankOverall: 1, rankRising: null, trancoRank: 900 },
  2: { heat: 45, change7d: 12, rankOverall: 2, rankRising: 1, trancoRank: 3_000 },
  3: { heat: 20, change7d: null, rankOverall: 4, rankRising: null, trancoRank: null },
  5: { heat: 30, change7d: 0, rankOverall: 3, rankRising: null, trancoRank: 50_000 },
}
const heatOf = (id: number) => heat[id]

const order = (board: Board, sort: Sort, since: Date | null = null) =>
  orderApps(apps, heatOf, { board, sort, now, newSince: since }).map((app) => app.name)

describe('boards', () => {
  it('lists every app by heat, then the unscored ones by name', () => {
    expect(order('top', 'heat')).toEqual(['Alpha', 'Bravo', 'Echo', 'Charlie', 'Delta'])
  })

  it('takes only apps with a place on the rising board', () => {
    expect(order('rising', 'change')).toEqual(['Bravo'])
  })

  it('takes apps listed in the last 30 days, newest first', () => {
    expect(order('new', 'newest')).toEqual(['Delta', 'Charlie', 'Bravo'])
  })

  it('leaves out apps listed before APPS_NEW_SINCE', () => {
    expect(order('new', 'newest', new Date(daysAgo(10)))).toEqual(['Delta', 'Charlie'])
  })

  it('works before the first heat run, by name', () => {
    expect(orderApps(apps, () => undefined, { board: 'top', sort: 'heat', now, newSince: null }).map((app) => app.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ])
    expect(orderApps(apps, () => undefined, { board: 'rising', sort: 'change', now, newSince: null })).toEqual([])
  })
})

describe('column sorts', () => {
  it('sorts by 7-day change, apps without one after, in heat order', () => {
    expect(order('top', 'change')).toEqual(['Bravo', 'Echo', 'Alpha', 'Charlie', 'Delta'])
  })

  it('sorts by site rank, best first, unranked after', () => {
    expect(order('top', 'site')).toEqual(['Alpha', 'Bravo', 'Echo', 'Charlie', 'Delta'])
  })

  it('sorts a board by heat as well', () => {
    expect(order('new', 'heat')).toEqual(['Bravo', 'Charlie', 'Delta'])
  })

  it('does not change the apps it was given', () => {
    const before = apps.map((app) => app.id)
    order('top', 'change')
    expect(apps.map((app) => app.id)).toEqual(before)
  })
})

describe('listing days', () => {
  it('starts the new board 30 days back, or at APPS_NEW_SINCE when that is later', () => {
    expect(listedSince(now, 30, null).toISOString()).toBe(daysAgo(30))
    expect(listedSince(now, 30, new Date(daysAgo(40))).toISOString()).toBe(daysAgo(30))
    expect(listedSince(now, 7, new Date(daysAgo(3))).toISOString()).toBe(daysAgo(3))
  })

  it('counts whole days since listing', () => {
    expect(daysSince(daysAgo(3), now)).toBe(3)
    expect(daysSince(new Date(now.getTime() - 60 * 60 * 1000).toISOString(), now)).toBe(0)
    expect(daysSince(new Date(now.getTime() + 60 * 60 * 1000).toISOString(), now)).toBe(0)
  })
})

describe('settings', () => {
  it('shows Tranco ranks only when turned on', () => {
    expect(showTrancoRank({})).toBe(false)
    expect(showTrancoRank({ APPS_SHOW_TRANCO_RANK: 'false' })).toBe(false)
    expect(showTrancoRank({ APPS_SHOW_TRANCO_RANK: 'yes' })).toBe(false)
    expect(showTrancoRank({ APPS_SHOW_TRANCO_RANK: ' TRUE ' })).toBe(true)
  })

  it('reads APPS_NEW_SINCE as a Shanghai day and ignores anything else', () => {
    expect(newSince({ APPS_NEW_SINCE: '2026-11-01' })?.toISOString()).toBe('2026-10-31T16:00:00.000Z')
    expect(newSince({})).toBeNull()
    expect(newSince({ APPS_NEW_SINCE: '2026/11/01' })).toBeNull()
    expect(newSince({ APPS_NEW_SINCE: '2026-13-45' })).toBeNull()
  })
})
