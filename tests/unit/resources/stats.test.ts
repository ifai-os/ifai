import { describe, expect, it } from 'vitest'

import { statsChanged, statsWindows } from '@/modules/resources/stats/rollup'

describe('the stats roll-up', () => {
  it('counts the seven days up to now and the seven before them', () => {
    const { weekStart, prevStart } = statsWindows(new Date('2026-10-23T04:00:00Z'))
    expect(weekStart.toISOString()).toBe('2026-10-16T04:00:00.000Z')
    expect(prevStart.toISOString()).toBe('2026-10-09T04:00:00.000Z')
  })

  it('writes a Skill only when a number changed, reading a missing one as 0', () => {
    const next = { installs: 12, installs7d: 3, installsPrev7d: 0, saves: 1 }
    expect(statsChanged({ installs: 12, installs7d: 3, installsPrev7d: 0, saves: 1 }, next)).toBe(false)
    expect(statsChanged({ installs: 12, installs7d: 3, saves: 1 }, next)).toBe(false)
    expect(statsChanged({ installs: 12, installs7d: 2, installsPrev7d: 0, saves: 1 }, next)).toBe(true)
    expect(statsChanged(null, { installs: 0, installs7d: 0, installsPrev7d: 0, saves: 0 })).toBe(false)
    expect(statsChanged(undefined, next)).toBe(true)
  })
})
