import { valueFrontier, type TrendPoint } from './rules'

/**
 * Where the two charts of the rankings page put things, as shares of the plot (0 at the left or
 * top, 1 at the right or bottom). Pure, so the pages draw them on the server and tests can check
 * them; the components turn them into SVG and labels.
 */

export type ValuePoint = { modelId: number; name: string; costUsd: number; score: number }

export type ValueChart = {
  dots: (ValuePoint & { x: number; y: number; frontier: boolean })[]
  /** The dashed line through the models nothing beats on both cost and score, cheapest first. */
  line: { x: number; y: number }[]
  /** The frontier's last three (the strongest end), named on the chart. */
  labelled: (ValuePoint & { x: number; y: number })[]
  /** One tick per factor of ten in cost: $0.01, $0.1, $1… */
  ticks: { usd: number; x: number }[]
}

/** 性价比: cost per task on a log scale across, score up. Needs at least one point with a cost above zero. */
export function valueChart(points: readonly ValuePoint[]): ValueChart {
  const usable = points.filter((point) => point.costUsd > 0)
  const logs = usable.map((point) => Math.log10(point.costUsd))
  let low = Math.floor(Math.min(...logs))
  let high = Math.ceil(Math.max(...logs))
  if (high - low < 1) high = low + 1
  // The edge decades only when a point sits right on them: otherwise half a decade of room.
  if (Math.min(...logs) - low > 0.5) low += 0.5
  if (high - Math.max(...logs) > 0.5) high -= 0.5
  const scores = usable.map((point) => point.score)
  const pad = Math.max(5, (Math.max(...scores) - Math.min(...scores)) * 0.1)
  const top = Math.max(...scores) + pad
  const bottom = Math.min(...scores) - pad
  const x = (usd: number) => (Math.log10(usd) - low) / (high - low)
  const y = (score: number) => (top - score) / (top - bottom)

  const frontier = valueFrontier(usable)
  const onFrontier = new Set(frontier.map((point) => point.modelId))
  const place = <T extends ValuePoint>(point: T) => ({ ...point, x: x(point.costUsd), y: y(point.score) })
  const ticks: ValueChart['ticks'] = []
  for (let decade = Math.ceil(low); decade <= Math.floor(high); decade++) ticks.push({ usd: 10 ** decade, x: x(10 ** decade) })
  return {
    dots: usable.map((point) => ({ ...place(point), frontier: onFrontier.has(point.modelId) })),
    line: frontier.map((point) => ({ x: x(point.costUsd), y: y(point.score) })),
    labelled: frontier.slice(-3).map(place),
    ticks,
  }
}

export type TrendChart = {
  open: { x: number; y: number }[]
  closed: { x: number; y: number }[]
  /** The score at the top and bottom edges, on whole fifties. */
  top: number
  bottom: number
  /** The first, middle and last weeks, for the dates under the chart. */
  weeks: { week: string; x: number }[]
}

/** 分数走势: the weeks evenly across, the best closed and best open-weights score of each up. */
export function trendChart(points: readonly TrendPoint[]): TrendChart {
  const values = points.flatMap((point) => [point.open, point.closed]).filter((value): value is number => value !== null)
  let top = Math.ceil((Math.max(...values) + 5) / 50) * 50
  let bottom = Math.floor((Math.min(...values) - 5) / 50) * 50
  if (top - bottom < 100) {
    top += 50
    bottom -= 50
  }
  const x = (index: number) => (points.length > 1 ? index / (points.length - 1) : 0.5)
  const y = (score: number) => (top - score) / (top - bottom)
  const line = (key: 'open' | 'closed') =>
    points.flatMap((point, index) => (point[key] === null ? [] : [{ x: x(index), y: y(point[key] as number) }]))
  const middle = Math.floor((points.length - 1) / 2)
  const marks = [...new Set([0, middle, points.length - 1])].filter((index) => index >= 0)
  return { open: line('open'), closed: line('closed'), top, bottom, weeks: marks.map((index) => ({ week: points[index].week, x: x(index) })) }
}

export type PlotBox = { left: number; top: number; width: number; height: number }

/** SVG points ("x,y x,y") for a line placed in a plot box. */
export function polyline(points: readonly { x: number; y: number }[], box: PlotBox): string {
  return points.map((point) => `${(box.left + point.x * box.width).toFixed(1)},${(box.top + point.y * box.height).toFixed(1)}`).join(' ')
}
