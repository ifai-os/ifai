import { useFormatter, useTranslations } from 'next-intl'

import { dateOfKey } from '@/lib/local-time'

import { polyline, trendChart, type PlotBox } from '../charts'
import { TREND_WEEKS, trendGap, type TrendPoint } from '../rules'

const box = { width: 600, height: 200 }
const plot: PlotBox = { left: 36, top: 12, width: 552, height: 160 }
const percent = (value: number, total: number) => `${(value / total) * 100}%`

/**
 * 「分数走势 · 近 12 周」: each week's best closed model (black) and best open-weights model (red),
 * with the gap between them at the start and the end in a sentence. Needs two weeks or more.
 */
export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const t = useTranslations('rankings')
  const format = useFormatter()
  const chart = trendChart(points)
  const gap = trendGap(points)
  const date = (week: string) => format.dateTime(dateOfKey(week), { month: 'numeric', day: 'numeric', timeZone: 'UTC' })

  return (
    <section
      aria-labelledby="rankings-trend"
      className="flex min-w-0 flex-[3_1_480px] flex-col gap-3 rounded-hero border border-surface-2 px-5 py-5.5 md:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rankings-trend" className="text-title">
          {t('trend', { weeks: TREND_WEEKS })}
        </h2>
        <span aria-hidden="true" className="flex gap-3.5 text-small text-ink-2">
          <span className="flex items-center gap-1">
            <span className="h-0.75 w-3.5 bg-ink" />
            {t('trendClosed')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.75 w-3.5 bg-accent" />
            {t('trendOpen')}
          </span>
        </span>
      </div>
      <div role="img" aria-label={gap ? t('trendGap', gap) : t('trendChart', { weeks: points.length })} className="relative aspect-[3/1] w-full">
        <svg viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
          <g className="stroke-surface-2" strokeWidth={1}>
            {[0, 1 / 3, 2 / 3, 1].map((y) => (
              <path key={y} d={`M${plot.left} ${plot.top + y * plot.height}H${plot.left + plot.width}`} />
            ))}
          </g>
          {chart.closed.length > 1 && (
            <polyline points={polyline(chart.closed, plot)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-ink" />
          )}
          {chart.open.length > 1 && (
            <polyline points={polyline(chart.open, plot)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-accent" />
          )}
        </svg>
        <span aria-hidden="true" className="absolute left-0 -translate-y-1/2 text-micro text-ink-4 tabular-nums" style={{ top: percent(plot.top, box.height) }}>
          {chart.top}
        </span>
        <span
          aria-hidden="true"
          className="absolute left-0 -translate-y-1/2 text-micro text-ink-4 tabular-nums"
          style={{ top: percent(plot.top + plot.height, box.height) }}
        >
          {chart.bottom}
        </span>
        {chart.weeks.map((mark, index) => (
          <span
            key={mark.week}
            aria-hidden="true"
            className={`absolute bottom-0 text-micro text-ink-4 tabular-nums ${
              index === 0 ? '' : index === chart.weeks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
            }`}
            style={{ left: percent(plot.left + mark.x * plot.width, box.width) }}
          >
            {date(mark.week)}
          </span>
        ))}
      </div>
      {gap && <p className="text-meta text-ink-2">{t('trendGap', gap)}</p>}
    </section>
  )
}
