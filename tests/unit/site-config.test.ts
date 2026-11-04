import { describe, expect, it } from 'vitest'

import {
  closedPathRedirect,
  homeHref,
  isLaunched,
  navItems,
  parseClosedModules,
  parsePhase,
  upcomingNavItems,
  visibleNavItems,
} from '@/config/site'

const keys = (items: { key: string }[]) => items.map((item) => item.key)

describe('phased navigation', () => {
  it('keeps the canvas order', () => {
    expect(keys([...navItems])).toEqual(['recommend', 'circles', 'daily', 'apps', 'rankings', 'resources', 'wiki'])
  })

  it('shows Daily, Apps and Resources in phase one', () => {
    expect(keys(visibleNavItems(1, []))).toEqual(['daily', 'apps', 'resources'])
    expect(keys(upcomingNavItems(1))).toEqual(['recommend', 'circles', 'rankings', 'wiki'])
  })

  it('adds For You and Circles in phase two, everything in phase three', () => {
    expect(keys(visibleNavItems(2, []))).toEqual(['recommend', 'circles', 'daily', 'apps', 'resources'])
    expect(visibleNavItems(3, [])).toHaveLength(7)
    expect(upcomingNavItems(3)).toHaveLength(0)
  })

  it('says whether a module has launched, for its pages and API', () => {
    expect(isLaunched('daily', 1, [])).toBe(true)
    expect(isLaunched('circles', 1, [])).toBe(false)
    expect(isLaunched('circles', 2, [])).toBe(true)
    expect(isLaunched('wiki', 2, [])).toBe(false)
  })

  it('falls back to phase one for missing or invalid values', () => {
    expect(parsePhase(undefined)).toBe(1)
    expect(parsePhase('9')).toBe(1)
    expect(parsePhase('2')).toBe(2)
  })
})

describe('modules closed for now', () => {
  it('closes apps and resources unless NEXT_PUBLIC_CLOSED_MODULES says otherwise', () => {
    expect(parseClosedModules(undefined)).toEqual(['apps', 'resources'])
    expect(parseClosedModules('')).toEqual(['apps', 'resources'])
    expect(parseClosedModules('none')).toEqual([])
    expect(parseClosedModules(' None ')).toEqual([])
    expect(parseClosedModules('apps')).toEqual(['apps'])
    expect(parseClosedModules('resources, apps,apps')).toEqual(['resources', 'apps'])
    expect(parseClosedModules('nonsense')).toEqual(['apps', 'resources'])
  })

  it('leaves them out of the navigation and says they are not open', () => {
    expect(keys(visibleNavItems(1, ['apps', 'resources']))).toEqual(['daily'])
    expect(keys(visibleNavItems(2, ['apps']))).toEqual(['recommend', 'circles', 'daily', 'resources'])
    expect(isLaunched('apps', 1, ['apps', 'resources'])).toBe(false)
    expect(isLaunched('resources', 3, ['resources'])).toBe(false)
    expect(isLaunched('daily', 1, ['apps', 'resources'])).toBe(true)
    // Closing doesn't move a module into「coming soon」.
    expect(keys(upcomingNavItems(1))).toEqual(['recommend', 'circles', 'rankings', 'wiki'])
  })

  it('sends home and the closed pages to the daily', () => {
    const closed = ['apps', 'resources'] as const
    expect(homeHref(closed)).toBe('/news')
    expect(homeHref(['apps'])).toBe('/news')
    expect(homeHref([])).toBe('/')
    for (const path of ['/', '/apps', '/apps/', '/apps/notion', '/apps/category/coding', '/apps/submit', '/resources', '/resources/skills/x', '/resources/guide']) {
      expect(closedPathRedirect(path, closed)).toBe('/news')
    }
    for (const path of ['/news', '/news/topic/kimi', '/search', '/me/saves', '/application', '/resourcesx']) {
      expect(closedPathRedirect(path, closed)).toBeNull()
    }
    expect(closedPathRedirect('/resources/guide', ['apps'])).toBeNull()
    expect(closedPathRedirect('/apps/notion', [])).toBeNull()
    expect(closedPathRedirect('/', [])).toBeNull()
  })
})
