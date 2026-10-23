import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { daysSince, trendDays, type Board, type Sort } from '../boards'
import type { RankedApp } from '../data'
import { listHref } from '../list-params'
import { AppTile } from './app-tile'
import { HeatDelta } from './heat-delta'
import { Sparkline } from './sparkline'

type SortableColumn = Extract<Sort, 'heat' | 'change' | 'site'>

type RankingTableProps = {
  apps: RankedApp[]
  board: Board
  sort: Sort
  category: string | null
  q: string
  /** The latest scored day, the right edge of the 7-day lines; null before the first run. */
  heatDay: string | null
  showSiteRank: boolean
  /** Rows after this many wait for「查看第 11–50 名」(see ./reveal-rows.tsx); null shows them all. */
  collapseAfter: number | null
  now: Date
}

/**
 * The list as a table: place, app, heat, 7-day change, site rank (only while ranks are shown)
 * and the last 7 days. Phones keep place, app and heat, with the change under the heat. Column
 * headings sort through the address (`?sort=`), so a sorted list can be shared and every page
 * of it is sorted the same way.
 */
export function RankingTable({ apps, board, sort, category, q, heatDay, showSiteRank, collapseAfter, now }: RankingTableProps) {
  const t = useTranslations('apps')
  const format = useFormatter()

  const header = (column: SortableColumn, className = '') => {
    const active = sort === column
    // Ranks read best first, so「网站排名」sorts up; heat and change sort down.
    const ascending = column === 'site'
    return (
      <th
        scope="col"
        aria-sort={active ? (ascending ? 'ascending' : 'descending') : undefined}
        className={`px-2 py-2 text-right font-medium md:py-3 ${className}`}
      >
        <Link
          href={listHref({ category, q, board, sort: column })}
          scroll={false}
          className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${active ? 'text-ink' : ''}`}
        >
          {t(`columns.${column}`)}
          <span aria-hidden="true">{active ? (ascending ? '↑' : '↓') : '↕'}</span>
        </Link>
      </th>
    )
  }

  return (
    <div className="md:overflow-hidden md:rounded-card md:border md:border-surface-2">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-small text-ink-4 md:bg-surface">
            <th scope="col" className="w-7 py-2 font-medium whitespace-nowrap md:w-14 md:py-3 md:pl-4">
              {t('columns.rank')}
            </th>
            <th scope="col" className="py-2 pl-3 font-medium md:px-2 md:py-3">
              {t('columns.app')}
            </th>
            {header('heat')}
            {header('change', 'hidden md:table-cell')}
            {showSiteRank && header('site', 'hidden md:table-cell')}
            <th scope="col" className="hidden py-3 pr-4 pl-2 font-medium whitespace-nowrap md:table-cell">
              {t('columns.trend')}
            </th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app, index) => {
            const extra = collapseAfter !== null && index >= collapseAfter
            const added = board === 'new' && app.listedAt ? t('addedDays', { days: daysSince(app.listedAt, now) }) : null
            const meta = [app.category?.name, added].filter(Boolean).join(' · ')
            return (
              <tr
                key={app.id}
                data-extra={extra ? '' : undefined}
                className={`border-t border-surface-2 ${extra ? 'hidden group-data-[open]/rows:table-row' : ''}`}
              >
                <td
                  className={`py-3 text-center text-body font-semibold tabular-nums md:py-3.5 md:pl-4 md:text-left ${
                    app.place <= 3 ? 'text-accent' : 'text-ink-4'
                  }`}
                >
                  {app.place}
                </td>
                <td className="w-full max-w-0 py-3 pl-3 md:px-2 md:py-3.5">
                  <Link href={`/apps/${app.slug}`} className="group flex min-w-0 items-center gap-3">
                    <AppTile name={app.name} slug={app.slug} logo={app.logo} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-title font-semibold group-hover:text-accent md:text-body md:font-medium">
                        {app.name}
                      </span>
                      {app.tagline && (
                        <span lang={app.tagline.lang} className="truncate text-meta text-ink-2 md:hidden">
                          {app.tagline.value}
                        </span>
                      )}
                      <span className="truncate text-small text-ink-4">
                        {meta}
                        {app.tagline && !added && (
                          <span className="max-md:hidden">
                            {meta && ' · '}
                            <span lang={app.tagline.lang}>{app.tagline.value}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="py-3 pl-3 text-right md:px-2 md:py-3.5">
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-title font-semibold tabular-nums md:text-ui">{app.heat?.heat ?? '—'}</span>
                    {app.heat && <HeatDelta change={app.heat.change7d} className="text-small tabular-nums md:hidden" />}
                  </span>
                </td>
                <td className="hidden px-2 text-right text-ui tabular-nums md:table-cell">
                  {app.heat && <HeatDelta change={app.heat.change7d} />}
                </td>
                {showSiteRank && (
                  <td className="hidden px-2 text-right text-ui text-ink-2 tabular-nums md:table-cell">
                    {app.heat?.trancoRank ? `#${format.number(app.heat.trancoRank)}` : '—'}
                  </td>
                )}
                <td className="hidden py-3.5 pr-4 pl-2 md:table-cell">
                  {heatDay && app.heat && (
                    <Sparkline
                      points={app.trend}
                      until={heatDay}
                      days={trendDays}
                      change={app.heat.change7d}
                      className="h-7 w-24"
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
