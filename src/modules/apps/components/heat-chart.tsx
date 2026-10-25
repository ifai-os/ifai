'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { dateOfKey } from '@/lib/local-time'

import type { HeatPoint } from '../data'

const DAY_MS = 24 * 60 * 60 * 1000
export const heatRanges = [7, 30, 90] as const
type Range = (typeof heatRanges)[number]

/** Plot box in SVG units; the SVG stretches to the column, so lines keep 2px with `non-scaling-stroke`. */
const plot = { width: 640, height: 160 }

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS

/** A y-range on whole fives around the values, at least 10 apart, inside 0–100. */
function domainOf(values: number[]): [number, number] {
  let low = Math.max(0, Math.floor((Math.min(...values) - 2) / 5) * 5)
  let high = Math.min(100, Math.ceil((Math.max(...values) + 2) / 5) * 5)
  if (high - low < 10) {
    if (high + 10 - (high - low) <= 100) high = low + 10
    else low = high - 10
  }
  return [low, high]
}

/**
 * An app's heat over the last 7, 30 or 90 days: one line with a light wash under it, the latest
 * day marked, and min / max and the first and last dates on the edges. Pointer or arrow keys
 * move a crosshair that reads out the day and its heat; the same numbers are in a table for
 * screen readers. A new app's line starts on its first scored day.
 */
export function HeatChart({ history }: { history: HeatPoint[] }) {
  const t = useTranslations('apps')
  const format = useFormatter()
  const id = useId()
  const [range, setRange] = useState<Range>(30)
  const [active, setActive] = useState<number | null>(null)

  const last = history[history.length - 1]
  const start = dayNumber(last.day) - range
  const inRange = history.filter((point) => dayNumber(point.day) >= start)
  // A gap longer than the range (the app was unpublished for a while): still draw the last two days.
  const points = inRange.length >= 2 ? inRange : history.slice(-2)
  const first = points[0]
  const span = Math.max(dayNumber(last.day) - dayNumber(first.day), 1)
  const [low, high] = domainOf(points.map((point) => point.heat))

  const x = (point: HeatPoint) => ((dayNumber(point.day) - dayNumber(first.day)) / span) * plot.width
  const y = (heat: number) => ((high - heat) / (high - low)) * plot.height
  const line = points.map((point) => `${x(point).toFixed(1)},${y(point.heat).toFixed(1)}`).join(' ')
  const area = `M0,${plot.height} L${line.replaceAll(' ', ' L')} L${plot.width},${plot.height} Z`

  const date = (day: string, style: 'short' | 'long' = 'short') =>
    format.dateTime(dateOfKey(day), style === 'short' ? { month: 'numeric', day: 'numeric', timeZone: 'UTC' } : { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const change = last.heat - first.heat
  const summary = t('heatChart', { days: range, from: first.heat, to: last.heat })
  const shown = active !== null ? points[active] : null
  const percent = (value: number, total: number) => `${(value / total) * 100}%`

  function pointAt(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const day = dayNumber(first.day) + ((event.clientX - box.left) / box.width) * span
    let nearest = 0
    for (let index = 1; index < points.length; index++) {
      if (Math.abs(dayNumber(points[index].day) - day) < Math.abs(dayNumber(points[nearest].day) - day)) nearest = index
    }
    setActive(nearest)
  }

  function step(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
    if (event.key === 'Escape') return setActive(null)
    if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(points.length - 1)
    else if (event.key in moves) {
      const from = active ?? points.length - 1
      setActive(Math.min(points.length - 1, Math.max(0, from + moves[event.key])))
    } else return
    event.preventDefault()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-h1">{last.heat}</span>
          <span aria-hidden="true" className={`text-meta font-medium ${change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-ink-4'}`}>
            {change > 0 ? '▲ ' : change < 0 ? '▼ ' : ''}
            {Math.abs(change)}
          </span>
          <span aria-hidden="true" className="text-small text-ink-4">
            {t('rangeChange', { days: range })}
          </span>
          <span className="sr-only">{summary}</span>
        </div>
        <div role="group" aria-label={t('heatRanges')} className="flex rounded-thumb bg-surface-2 p-0.75">
          {heatRanges.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={days === range}
              onClick={() => {
                setRange(days)
                setActive(null)
              }}
              className={`h-7.5 rounded-btn px-2.5 text-meta transition-colors ${
                days === range ? 'bg-bg text-ink shadow-divider' : 'text-ink-4 hover:text-ink'
              }`}
            >
              {t('heatRange', { days })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
        <div aria-hidden="true" className="flex flex-col justify-between text-micro text-ink-4 tabular-nums">
          <span className="-translate-y-1/2">{high}</span>
          <span className="translate-y-1/2">{low}</span>
        </div>
        <div
          role="img"
          aria-label={summary}
          aria-describedby={`${id}-readout`}
          tabIndex={0}
          onPointerMove={pointAt}
          onPointerLeave={() => setActive(null)}
          onKeyDown={step}
          onBlur={() => setActive(null)}
          className="relative h-40 touch-pan-y rounded-thumb"
        >
          <svg
            viewBox={`0 0 ${plot.width} ${plot.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
          >
            <line x1="0" x2={plot.width} y1="0" y2="0" vectorEffect="non-scaling-stroke" className="stroke-surface-2" />
            <line x1="0" x2={plot.width} y1={plot.height / 2} y2={plot.height / 2} vectorEffect="non-scaling-stroke" className="stroke-surface-2" />
            <line x1="0" x2={plot.width} y1={plot.height} y2={plot.height} vectorEffect="non-scaling-stroke" className="stroke-line" />
            <path d={area} className="fill-accent opacity-10" />
            <polyline
              points={line}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-accent"
            />
            {shown && (
              <line
                x1={x(shown)}
                x2={x(shown)}
                y1="0"
                y2={plot.height}
                vectorEffect="non-scaling-stroke"
                className="stroke-ink-4"
              />
            )}
          </svg>
          {/* Dots are HTML, so the stretched SVG cannot turn them into ovals. */}
          {[shown ?? last].map((point) => (
            <span
              key={point.day}
              aria-hidden="true"
              className="absolute size-2.5 -translate-1/2 rounded-pill border-2 border-bg bg-accent"
              style={{ left: percent(x(point), plot.width), top: percent(y(point.heat), plot.height) }}
            />
          ))}
          <div
            id={`${id}-readout`}
            aria-live="polite"
            className={`pointer-events-none absolute top-0 flex flex-col rounded-thumb border border-line bg-overlay px-2.5 py-1.5 shadow-float ${
              shown ? '' : 'sr-only'
            } ${shown && x(shown) > plot.width / 2 ? '-translate-x-[calc(100%+8px)]' : 'translate-x-2'}`}
            style={shown ? { left: percent(x(shown), plot.width) } : undefined}
          >
            {shown && (
              <>
                <span className="text-ui font-semibold tabular-nums">
                  {t('heat')} {shown.heat}
                </span>
                <span className="text-small text-ink-4">{date(shown.day, 'long')}</span>
              </>
            )}
          </div>
        </div>
        <div aria-hidden="true" className="col-start-2 flex justify-between pt-1 text-micro text-ink-4 tabular-nums">
          <span>{date(first.day)}</span>
          <span>{date(last.day)}</span>
        </div>
      </div>

      <table className="sr-only">
        <caption>{t('heatTable')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('heatDay')}</th>
            <th scope="col">{t('heat')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <td>{date(point.day, 'long')}</td>
              <td>{point.heat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
