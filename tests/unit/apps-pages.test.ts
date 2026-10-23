import { describe, expect, it, vi } from 'vitest'

import { refreshAppsAfterChange } from '@/modules/apps/cache'
import { listHref, readListParams } from '@/modules/apps/list-params'
import { initialOf, inReaderLanguage } from '@/modules/apps/localized'

describe('list addresses', () => {
  it('reads the search and the page', () => {
    expect(readListParams({})).toEqual({ q: '', page: 1, board: 'top', sort: 'heat' })
    expect(readListParams({ q: '  ai   video ', page: '3' })).toMatchObject({ q: 'ai video', page: 3 })
    expect(readListParams({ q: ['first', 'second'] })).toMatchObject({ q: 'first', page: 1 })
  })

  it('reads the board and the sort, each board with its own default sort', () => {
    expect(readListParams({ board: 'rising' })).toMatchObject({ board: 'rising', sort: 'change' })
    expect(readListParams({ board: 'new' })).toMatchObject({ board: 'new', sort: 'newest' })
    expect(readListParams({ board: 'new', sort: 'heat' })).toMatchObject({ board: 'new', sort: 'heat' })
    expect(readListParams({ board: 'hot', sort: 'random' })).toMatchObject({ board: 'top', sort: 'heat' })
    expect(readListParams({ board: 'rising', sort: 'random' })).toMatchObject({ board: 'rising', sort: 'change' })
  })

  it('cuts long searches to 64 characters', () => {
    expect(readListParams({ q: '视'.repeat(80) }).q).toBe('视'.repeat(64))
  })

  it('answers no page for anything but a whole number from 1', () => {
    for (const page of ['0', '-1', '1.5', '01', 'two', '9999999']) {
      expect(readListParams({ page }).page).toBeNull()
    }
  })

  it('builds list addresses, leaving out page 1 and an empty search', () => {
    expect(listHref({})).toBe('/apps')
    expect(listHref({ category: 'coding' })).toBe('/apps/category/coding')
    expect(listHref({ category: 'coding', q: 'AI 视频', page: 2 })).toBe('/apps/category/coding?q=AI+%E8%A7%86%E9%A2%91&page=2')
    expect(listHref({ q: '', page: 1 })).toBe('/apps')
  })

  it('keeps the board and the sort in addresses only when they are not the default', () => {
    expect(listHref({ board: 'top', sort: 'heat' })).toBe('/apps')
    expect(listHref({ board: 'rising', sort: 'change' })).toBe('/apps?board=rising')
    expect(listHref({ board: 'rising', sort: 'heat', page: 2 })).toBe('/apps?board=rising&sort=heat&page=2')
    expect(listHref({ category: 'coding', sort: 'change' })).toBe('/apps/category/coding?sort=change')
  })
})

describe('reader language', () => {
  it("uses the reader's language when it has content", () => {
    expect(inReaderLanguage({ en: 'Chat app', ja: 'チャットアプリ' }, 'ja')).toEqual({ value: 'チャットアプリ', lang: 'ja' })
  })

  it('falls back to English and says so', () => {
    expect(inReaderLanguage({ en: 'Chat app', ko: '' }, 'ko')).toEqual({ value: 'Chat app', lang: 'en' })
    expect(inReaderLanguage({ en: ['chat'], 'zh-Hans': [] }, 'zh-Hans')).toEqual({ value: ['chat'], lang: 'en' })
  })

  it('gives nothing when no language has content', () => {
    expect(inReaderLanguage({ 'zh-Hans': '  ' }, 'en')).toBeNull()
    expect(inReaderLanguage(null, 'en')).toBeNull()
  })

  it('takes the first letter of a name for its tile', () => {
    expect(initialOf('kitecode')).toBe('K')
    expect(initialOf(' 腾讯元宝')).toBe('腾')
    expect(initialOf('')).toBe('?')
  })
})

describe('page refresh after a save', () => {
  it('does nothing outside Next.js, so scripts and migrations can save apps', () => {
    const warn = vi.fn()
    const doc = { id: 1 }
    const result = refreshAppsAfterChange({ doc, req: { payload: { logger: { warn } } } } as never)
    expect(result).toBe(doc)
    expect(warn).not.toHaveBeenCalled()
  })
})
