/**
 * The list's boards and column sorts (docs/specs/apps.md「页面与路由」): which published apps a
 * board takes and in what order. Pure functions over the apps and their latest heat, so they
 * can be tested without a database.
 */

export const boards = ['top', 'rising', 'new'] as const
export type Board = (typeof boards)[number]

/** `site` sorts by Tranco rank and is offered only while ranks are shown; `newest` is the new board's own order. */
export const sorts = ['heat', 'change', 'site', 'newest'] as const
export type Sort = (typeof sorts)[number]

export const defaultSorts: Record<Board, Sort> = { top: 'heat', rising: 'change', new: 'newest' }

/** The new board takes apps listed in the last 30 days; the sidebar's「本周新上架」the last 7. */
export const newDays = 30
export const newcomerDays = 7

/** The list's little line covers the last 7 changes: 8 scored days. */
export const trendDays = 7

const DAY_MS = 24 * 60 * 60 * 1000

export type Candidate = { id: number; name: string; listedAt: string | null }

/** What ordering needs of an app's latest heat. */
export type ListHeat = {
  heat: number
  change7d: number | null
  /** Place among all apps by heat, ties already broken (Tranco rank, clicks, name). */
  rankOverall: number
  rankRising: number | null
  trancoRank: number | null
}

export type OrderOptions = {
  board: Board
  sort: Sort
  now: Date
  /** The new board leaves out apps listed before this (the first import, see APPS_NEW_SINCE). */
  newSince: Date | null
}

/** The earliest listing time the new board (`days` = newDays) or the newcomers (newcomerDays) take. */
export function listedSince(now: Date, days: number, newSince: Date | null): Date {
  const since = new Date(now.getTime() - days * DAY_MS)
  return newSince && newSince > since ? newSince : since
}

/** Whole days between listing and now, for「3 天前收录」. */
export function daysSince(listedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(listedAt)) / DAY_MS))
}

const byName = (a: Candidate, b: Candidate) => a.name.localeCompare(b.name, 'en') || a.id - b.id

/**
 * The board's apps in the order of `sort`. Apps the job has not scored yet (published after
 * the last run) come after the scored ones, by name; so does everything before the first run.
 */
export function orderApps(
  candidates: readonly Candidate[],
  heatOf: (id: number) => ListHeat | undefined,
  { board, sort, now, newSince }: OrderOptions,
): Candidate[] {
  let apps = [...candidates]
  if (board === 'rising') apps = apps.filter((app) => heatOf(app.id)?.rankRising != null)
  if (board === 'new') {
    const since = listedSince(now, newDays, newSince).getTime()
    apps = apps.filter((app) => app.listedAt !== null && Date.parse(app.listedAt) >= since)
  }

  const byHeat = (a: Candidate, b: Candidate) => {
    const x = heatOf(a.id)
    const y = heatOf(b.id)
    if (x && y) return x.rankOverall - y.rankOverall
    if (x || y) return x ? -1 : 1
    return byName(a, b)
  }
  // Apps without the figure go after the ones with it, in heat order.
  const by = (figure: (heat: ListHeat) => number | null, direction: 1 | -1) => (a: Candidate, b: Candidate) => {
    const x = heatOf(a.id)
    const y = heatOf(b.id)
    const fx = x ? figure(x) : null
    const fy = y ? figure(y) : null
    if (fx !== null && fy !== null && fx !== fy) return (fx - fy) * direction
    if ((fx === null) !== (fy === null)) return fx === null ? 1 : -1
    return byHeat(a, b)
  }
  const compare = {
    heat: byHeat,
    change: by((heat) => heat.change7d, -1),
    site: by((heat) => heat.trancoRank, 1),
    newest: (a: Candidate, b: Candidate) => {
      const x = a.listedAt ? Date.parse(a.listedAt) : -Infinity
      const y = b.listedAt ? Date.parse(b.listedAt) : -Infinity
      return y - x || byName(a, b)
    },
  }[sort]

  return apps.sort(compare)
}
