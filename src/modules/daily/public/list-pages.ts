/**
 * How the daily list is cut into pages (站长, 2026-10-27): each page is two weeks of news, so the
 * first screen shows the last 14 days that have stories and「加载更多」adds the 14 before them.
 * A page stops early at 100 stories so a busy fortnight does not load hundreds at once; a single
 * day always fits on one page. Days are UTC dates; the feed regroups them by the reader's day.
 * Pure: ./data.ts counts the stories per day and fetches a page's days.
 */

export const listPageDays = 14
export const listPageMaxStories = 100

/** Published stories on one UTC day ("2026-10-27"). */
export type DayCount = { day: string; count: number }

/** A page's days, inclusive: `from` the oldest, `to` the newest. */
export type ListPageRange = { from: string; to: string; count: number }

/** The pages, newest first, from the days that have stories (any order). */
export function listPages(days: readonly DayCount[]): ListPageRange[] {
  const sorted = days.filter((day) => day.count > 0).sort((a, b) => (a.day < b.day ? 1 : -1))
  const pages: ListPageRange[] = []
  let current: DayCount[] = []
  let count = 0
  const close = () => {
    if (current.length) pages.push({ from: current[current.length - 1].day, to: current[0].day, count })
    current = []
    count = 0
  }
  for (const day of sorted) {
    if (current.length && (current.length === listPageDays || count + day.count > listPageMaxStories)) close()
    current.push(day)
    count += day.count
  }
  close()
  return pages
}

/** The instants a page covers: from the start of its oldest day to the start of the day after its newest. */
export function pageBounds(range: ListPageRange): { since: string; until: string } {
  const until = new Date(`${range.to}T00:00:00.000Z`)
  until.setUTCDate(until.getUTCDate() + 1)
  return { since: `${range.from}T00:00:00.000Z`, until: until.toISOString() }
}
