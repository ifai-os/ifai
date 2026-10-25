import { describe, expect, it } from 'vitest'

import { isLaunched, navItems, parsePhase, upcomingNavItems, visibleNavItems } from '@/config/site'

const keys = (items: { key: string }[]) => items.map((item) => item.key)

describe('phased navigation', () => {
  it('keeps the canvas order', () => {
    expect(keys([...navItems])).toEqual(['recommend', 'circles', 'daily', 'apps', 'rankings', 'resources', 'wiki'])
  })

  it('shows Daily, Apps and Resources in phase one', () => {
    expect(keys(visibleNavItems(1))).toEqual(['daily', 'apps', 'resources'])
    expect(keys(upcomingNavItems(1))).toEqual(['recommend', 'circles', 'rankings', 'wiki'])
  })

  it('adds For You and Circles in phase two, everything in phase three', () => {
    expect(keys(visibleNavItems(2))).toEqual(['recommend', 'circles', 'daily', 'apps', 'resources'])
    expect(visibleNavItems(3)).toHaveLength(7)
    expect(upcomingNavItems(3)).toHaveLength(0)
  })

  it('says whether a module has launched, for its pages and API', () => {
    expect(isLaunched('daily', 1)).toBe(true)
    expect(isLaunched('circles', 1)).toBe(false)
    expect(isLaunched('circles', 2)).toBe(true)
    expect(isLaunched('wiki', 2)).toBe(false)
  })

  it('falls back to phase one for missing or invalid values', () => {
    expect(parsePhase(undefined)).toBe(1)
    expect(parsePhase('9')).toBe(1)
    expect(parsePhase('2')).toBe(2)
  })
})
