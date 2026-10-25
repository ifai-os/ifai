import { useFormatter, useTranslations } from 'next-intl'

import { polyline, valueChart, type PlotBox, type ValuePoint } from '../charts'
import { useCostFormat } from './cost-format'

/** The chart box and the plot inside it, in SVG units; the box keeps this shape, so dots stay round. */
const box = { width: 440, height: 260 }
const plot: PlotBox = { left: 44, top: 18, width: 380, height: 200 }

const left = (x: number) => plot.left + x * plot.width
const top = (y: number) => plot.top + y * plot.height
const percent = (value: number, total: number) => `${(value / total) * 100}%`

/**
 * 性价比: each placed model with a cost, cost per task across (log scale) and score up; the
 * dashed line joins the models nothing beats on both, its strongest three named, and listed
 * under the chart as「最划算的选择」. Drawn on the server; hovering a dot names it.
 */
export function ValueForMoney({ points }: { points: ValuePoint[] }) {
  const t = useTranslations('rankings')
  const format = useFormatter()
  const cost = useCostFormat()
  const chart = valueChart(points)
  const picks = [...chart.labelled].reverse()

  return (
    <section
      aria-labelledby="rankings-value"
      className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-hero border border-surface-2 px-5 py-5.5 md:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="rankings-value" className="text-title">
          {t('value')}
        </h2>
        <span className="text-small text-ink-4">{t('valueAxes')}</span>
      </div>
      <div role="img" aria-label={t('valueChart')} className="relative aspect-[22/13] w-full">
        <svg viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
          <g className="stroke-surface-2" strokeWidth={1}>
            {[0, 1 / 3, 2 / 3, 1].map((y) => (
              <path key={y} d={`M${plot.left} ${top(y)}H${plot.left + plot.width}`} />
            ))}
            <path d={`M${plot.left} ${plot.top}V${plot.top + plot.height}`} />
          </g>
          <polyline
            points={polyline(chart.line, plot)}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            className="stroke-accent"
          />
          {chart.dots.map((dot) => (
            <circle
              key={dot.modelId}
              cx={left(dot.x)}
              cy={top(dot.y)}
              r={dot.frontier ? 6 : 4.5}
              strokeWidth={1.5}
              className={`stroke-bg ${dot.frontier ? 'fill-accent' : 'fill-mute'}`}
            >
              <title>{`${dot.name} · ${cost(dot.costUsd)} · ${Math.round(dot.score)}`}</title>
            </circle>
          ))}
        </svg>
        <span aria-hidden="true" className="absolute left-0 text-micro text-ink-4" style={{ top: percent(plot.top - 8, box.height) }}>
          {t('high')}
        </span>
        <span aria-hidden="true" className="absolute left-0 text-micro text-ink-4" style={{ top: percent(plot.top + plot.height - 8, box.height) }}>
          {t('low')}
        </span>
        {chart.ticks.map((tick) => (
          <span
            key={tick.usd}
            aria-hidden="true"
            className="absolute bottom-0 -translate-x-1/2 text-micro text-ink-4 tabular-nums"
            style={{ left: percent(left(tick.x), box.width) }}
          >
            {format.number(tick.usd, { style: 'currency', currency: 'USD', maximumSignificantDigits: 1 })}
          </span>
        ))}
        {chart.labelled.map((dot) => (
          <span
            key={dot.modelId}
            aria-hidden="true"
            className="absolute max-w-[40%] -translate-y-[130%] truncate pl-2.5 text-micro font-medium"
            style={{ left: percent(left(dot.x), box.width), top: percent(top(dot.y), box.height) }}
          >
            {dot.name}
          </span>
        ))}
      </div>
      <div className="flex flex-col">
        <h3 className="pb-1 text-meta text-ink-4">{t('valuePicks')}</h3>
        <ul>
          {picks.map((dot) => (
            <li key={dot.modelId} className="flex justify-between gap-3 border-t border-surface-2 py-2 text-meta">
              <span className="min-w-0 truncate font-medium">{dot.name}</span>
              <span className="flex-none text-ink-4 tabular-nums">
                {t('perTask', { cost: cost(dot.costUsd) })} · {Math.round(dot.score)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
