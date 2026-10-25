import { describe, expect, it } from 'vitest'

import { polyline, trendChart, valueChart, type ValuePoint } from '@/modules/rankings/charts'

describe('valueChart', () => {
  const points: ValuePoint[] = [
    { modelId: 1, name: 'Lumen 4', costUsd: 0.012, score: 1111 },
    { modelId: 2, name: 'Atlas Pro 2', costUsd: 0.019, score: 1048 },
    { modelId: 3, name: 'Kestrel 3 Coder', costUsd: 0.0007, score: 1053 },
    { modelId: 4, name: 'Tundra 1.5', costUsd: 0.0005, score: 925 },
    { modelId: 5, name: 'Orchid Large', costUsd: 0.0042, score: 950 },
    { modelId: 6, name: 'No cost data', costUsd: 0, score: 1200 },
  ]
  const chart = valueChart(points)

  it('spreads cost on a log scale with a tick per factor of ten, leaving out models without a cost', () => {
    expect(chart.dots.map((dot) => dot.modelId)).toEqual([1, 2, 3, 4, 5])
    expect(chart.ticks.map((tick) => tick.usd)).toEqual([0.001, 0.01])
    for (const dot of chart.dots) {
      for (const value of [dot.x, dot.y]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
    const x = (id: number) => chart.dots.find((dot) => dot.modelId === id)?.x as number
    expect(x(4)).toBeLessThan(x(3))
    expect(x(3)).toBeLessThan(x(1))
  })

  it('draws the frontier cheapest first and names its strongest three', () => {
    expect(chart.dots.filter((dot) => dot.frontier).map((dot) => dot.modelId)).toEqual([1, 3, 4])
    expect(chart.line).toHaveLength(3)
    expect(chart.line[0].x).toBeLessThan(chart.line[1].x)
    expect(chart.line[1].y).toBeGreaterThan(chart.line[2].y)
    expect(chart.labelled.map((point) => point.name)).toEqual(['Tundra 1.5', 'Kestrel 3 Coder', 'Lumen 4'])
  })
})

describe('trendChart', () => {
  it('rounds the scale to fifties, at least 100 points tall, and marks the first, middle and last week', () => {
    const chart = trendChart([
      { week: '2026-10-05', open: 1001, closed: 1100 },
      { week: '2026-10-12', open: null, closed: 1099 },
      { week: '2026-10-19', open: 1053, closed: 1111 },
    ])
    expect([chart.bottom, chart.top]).toEqual([950, 1150])
    expect(chart.closed.map((point) => point.x)).toEqual([0, 0.5, 1])
    expect(chart.open.map((point) => point.x)).toEqual([0, 1])
    expect(chart.weeks).toEqual([
      { week: '2026-10-05', x: 0 },
      { week: '2026-10-12', x: 0.5 },
      { week: '2026-10-19', x: 1 },
    ])
    expect(trendChart([{ week: '2026-10-19', open: 1000, closed: 1010 }])).toMatchObject({ top: 1050, bottom: 950, weeks: [{ week: '2026-10-19', x: 0.5 }] })
  })

  it('turns shares of the plot into SVG points', () => {
    expect(polyline([{ x: 0, y: 1 }, { x: 0.5, y: 0.25 }], { left: 36, top: 12, width: 552, height: 160 })).toBe('36.0,172.0 312.0,52.0')
  })
})
