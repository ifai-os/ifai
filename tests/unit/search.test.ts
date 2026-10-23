import { describe, expect, it } from 'vitest'

import { visibleKinds } from '@/modules/search/kinds'
import { cleanQuery, readSearchParams, searchHref } from '@/modules/search/params'
import { nameMatch, namesFirst } from '@/modules/search/rank'

describe('readSearchParams', () => {
  it('tidies the search and defaults to every kind, page 1', () => {
    expect(readSearchParams({ q: '  agent   代码审查 ' })).toEqual({ q: 'agent 代码审查', type: 'all', page: 1 })
  })

  it('takes a known kind and treats anything else as all', () => {
    expect(readSearchParams({ q: 'x', type: 'apps' }).type).toBe('apps')
    expect(readSearchParams({ q: 'x', type: 'wiki' }).type).toBe('all')
    expect(readSearchParams({ q: 'x', type: ['skills', 'apps'] }).type).toBe('skills')
  })

  it('gives no page for anything but a whole number from 1', () => {
    expect(readSearchParams({ page: '3' }).page).toBe(3)
    for (const page of ['0', '-1', '1.5', 'x', '01']) expect(readSearchParams({ page }).page, page).toBeNull()
  })

  it('cuts the search at 64 characters, counting characters rather than code units', () => {
    expect(Array.from(cleanQuery('😀'.repeat(80)))).toHaveLength(64)
  })
})

describe('searchHref', () => {
  it('leaves out the defaults', () => {
    expect(searchHref()).toBe('/search')
    expect(searchHref({ q: 'claude', type: 'all', page: 1 })).toBe('/search?q=claude')
    expect(searchHref({ q: 'a b', type: 'daily', page: 2 })).toBe('/search?q=a+b&type=daily&page=2')
  })
})

describe('namesFirst', () => {
  const items = [
    { names: ['Claude Code'] },
    { names: ['Writer', 'claude helper'] },
    { names: ['Claude'] },
    { names: ['Notes'] },
  ]

  it('puts the exact name first, then names that start with the search, and keeps the rest in order', () => {
    expect(namesFirst(items, 'claude', (item) => item.names).map((item) => item.names[0])).toEqual([
      'Claude',
      'Claude Code',
      'Writer',
      'Notes',
    ])
  })

  it('ignores case, width and extra spaces', () => {
    expect(nameMatch(['ＣＬＡＵＤＥ  Code'], 'claude code')).toBe(0)
    expect(nameMatch(['通义千问'], '通义')).toBe(1)
    expect(nameMatch(['Kimi'], '')).toBe(2)
  })
})

describe('visibleKinds', () => {
  it('searches the Daily, apps and Skills from the first phase', () => {
    expect(visibleKinds(1)).toEqual(['daily', 'apps', 'skills'])
    expect(visibleKinds(3)).toEqual(['daily', 'apps', 'skills'])
  })
})
