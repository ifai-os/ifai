import { useFormatter, useTranslations } from 'next-intl'

import { dateOfKey } from '@/lib/local-time'

import { polyline, trendChart, type PlotBox } from '../charts'
import { TREND_WEEKS, trendGap, type TrendPoint } from '../rules'

const box = { width: 600, height: 200 }
// The scores sit in a gutter left of the plot and the weeks in a row under it, so no label meets another at any width.
const plot: PlotBox = { left: 0, top: 12, width: 600, height: 176 }
const percent = (value: number, total: number) => `${(value / total) * 100}%`

type ScoreTrendProps = {
  points: TrendPoint[]
  /** One point a month (an outside board's history): titled by months, dated by month. */
  monthly?: boolean
}

/**
 * 「分数走势 · 近 12 周」: each week's best closed model (black) and best open-weights model (red),
 * with the gap between them at the start and the end in a sentence. Needs two weeks or more.
 * An outside board's history comes one point a month (「近 24 个月」).
 */
export function ScoreTrend({ points, monthly = false }: ScoreTrendProps) {
  const t = useTranslations('rankings')
  const format = useFormatter()
  const chart = trendChart(points)
  const gap = trendGap(points)
  const gapText = gap && (gap.from === gap.to ? t('trendGapSame', gap) : t('trendGap', gap))
  const date = (week: string) =>
    format.dateTime(dateOfKey(week), monthly ? { year: 'numeric', month: 'numeric', timeZone: 'UTC' } : { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  const title = monthly ? t('trendMonths', { months: points.length }) : t('trend', { weeks: TREND_WEEKS })
  const label = monthly ? t('trendMonthsChart', { months: points.length }) : t('trendChart', { weeks: points.length })

  return (
    <section
      aria-labelledby="rankings-trend"
      className="flex min-w-0 flex-[3_1_480px] flex-col gap-3 rounded-hero border border-surface-2 px-5 py-5.5 md:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rankings-trend" className="text-title">
          {title}
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
      <div role="img" aria-label={gapText ?? label} className="flex flex-col gap-1 pl-8">
        <div className="relative aspect-[3/1] w-full">
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
          {[
            { score: chart.top, y: plot.top },
            { score: chart.bottom, y: plot.top + plot.height },
          ].map((tick) => (
            <span
              key={tick.y}
              aria-hidden="true"
              className="absolute right-full mr-1.5 -translate-y-1/2 text-micro whitespace-nowrap text-ink-4 tabular-nums"
              style={{ top: percent(tick.y, box.height) }}
            >
              {tick.score}
            </span>
          ))}
        </div>
        <div aria-hidden="true" className="relative h-4.5 w-full">
          {chart.weeks.map((mark, index) => (
            <span
              key={mark.week}
              className={`absolute top-0 text-micro whitespace-nowrap text-ink-4 tabular-nums ${
                index === 0 ? '' : index === chart.weeks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
              }`}
              style={{ left: percent(plot.left + mark.x * plot.width, box.width) }}
            >
              {date(mark.week)}
            </span>
          ))}
        </div>
      </div>
      {gapText && <p className="text-meta text-ink-2">{gapText}</p>}
    </section>
  )
}
