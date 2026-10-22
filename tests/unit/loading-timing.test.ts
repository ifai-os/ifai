import { describe, expect, it } from 'vitest'

import { skeletonCard, skeletonRow } from '@/components/states/skeleton'
import { loadingPhase, loadTimeoutMs, skeletonDelayMs } from '@/components/states/timing'

describe('loadingPhase', () => {
  it('holds the space silently, shimmers after 300 ms and gives up after 10 s', () => {
    expect(skeletonDelayMs).toBe(300)
    expect(loadTimeoutMs).toBe(10_000)
    expect(loadingPhase(0)).toBe('waiting')
    expect(loadingPhase(299)).toBe('waiting')
    expect(loadingPhase(300)).toBe('skeleton')
    expect(loadingPhase(9_999)).toBe('skeleton')
    expect(loadingPhase(10_000)).toBe('failed')
  })
})

describe('skeleton widths', () => {
  it('vary row by row and repeat after four rows', () => {
    const rows = [0, 1, 2, 3].map(skeletonRow)
    expect(new Set(rows.map((row) => row.title)).size).toBe(4)
    expect(skeletonRow(4)).toEqual(skeletonRow(0))
    for (const { title, meta } of rows) {
      expect(parseInt(meta, 10)).toBe(parseInt(title, 10) - 22)
    }
  })

  it('alternate between two card shapes', () => {
    expect(skeletonCard(0)).not.toEqual(skeletonCard(1))
    expect(skeletonCard(2)).toEqual(skeletonCard(0))
  })
})
