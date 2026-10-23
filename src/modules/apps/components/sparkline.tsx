import type { HeatPoint } from '../data'

const DAY_MS = 24 * 60 * 60 * 1000
const box = { width: 120, height: 40, padX: 4, padY: 4 }
/**
 * Height per point of heat, the same on every line, so equal slopes mean equal changes from
 * row to row; only a swing too wide for the box is squeezed to fit.
 */
const perPoint = 3

type SparklineProps = {
  /** Oldest first. */
  points: HeatPoint[]
  /** The last day the line covers: the latest scored day, at the right edge. */
  until: string
  /** How many days back the left edge is. */
  days: number
  /** The 7-day change beside it, which picks the color: up, down or flat. */
  change: number | null
  className?: string
}

/**
 * The last week of heat as a small line beside the numbers. Decorative: the change next to it
 * says the same in words and figures. Missing days are skipped, not drawn as zero.
 */
export function Sparkline({ points, until, days, change, className = '' }: SparklineProps) {
  if (points.length < 2) return null

  const end = Date.parse(`${until}T00:00:00Z`)
  const values = points.map((point) => point.heat)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const scale = Math.min(perPoint, (box.height - 2 * box.padY) / Math.max(high - low, 1))
  const middle = (low + high) / 2
  const x = (day: string) =>
    box.width - box.padX - ((end - Date.parse(`${day}T00:00:00Z`)) / DAY_MS / days) * (box.width - 2 * box.padX)
  const y = (heat: number) => box.height / 2 - (heat - middle) * scale
  const line = points.map((point) => `${x(point.day).toFixed(1)},${y(point.heat).toFixed(1)}`).join(' ')
  const tone = change && change > 0 ? 'stroke-up' : change && change < 0 ? 'stroke-down' : 'stroke-ink-4'

  return (
    <svg
      viewBox={`0 0 ${box.width} ${box.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`overflow-visible ${className}`}
    >
      <polyline
        points={line}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={tone}
      />
    </svg>
  )
}
