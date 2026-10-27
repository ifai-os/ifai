import { describe, expect, it } from 'vitest'

import { listPageDays, listPages, pageBounds } from '@/modules/daily/public/list-pages'

const day = (n: number) => new Date(Date.UTC(2026, 9, 27 - n)).toISOString().slice(0, 10)

describe("the daily list's pages", () => {
  it('puts the 14 newest days that have stories on the first page, the 14 before on the next', () => {
    const days = Array.from({ length: 30 }, (_, n) => ({ day: day(n), count: 3 }))
    const pages = listPages(days)
    expect(pages.map((page) => [page.to, page.from, page.count])).toEqual([
      [day(0), day(listPageDays - 1), 42],
      [day(14), day(27), 42],
      [day(28), day(29), 6],
    ])
  })

  it('skips days without stories, so a page is never empty', () => {
    const pages = listPages([
      { day: '2026-10-27', count: 2 },
      { day: '2026-09-01', count: 1 },
      { day: '2026-10-01', count: 0 },
    ])
    expect(pages).toEqual([{ from: '2026-09-01', to: '2026-10-27', count: 3 }])
    expect(listPages([])).toEqual([])
  })

  it('stops a page early at 100 stories, but keeps a busy day whole', () => {
    const pages = listPages([
      { day: '2026-10-27', count: 60 },
      { day: '2026-10-26', count: 50 },
      { day: '2026-10-25', count: 130 },
      { day: '2026-10-24', count: 5 },
    ])
    expect(pages.map((page) => [page.to, page.from, page.count])).toEqual([
      ['2026-10-27', '2026-10-27', 60],
      ['2026-10-26', '2026-10-26', 50],
      ['2026-10-25', '2026-10-25', 130],
      ['2026-10-24', '2026-10-24', 5],
    ])
  })

  it('covers whole UTC days', () => {
    expect(pageBounds({ from: '2026-10-14', to: '2026-10-31', count: 1 })).toEqual({
      since: '2026-10-14T00:00:00.000Z',
      until: '2026-11-01T00:00:00.000Z',
    })
  })
})
