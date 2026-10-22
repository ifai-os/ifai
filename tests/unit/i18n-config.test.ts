import { describe, expect, it } from 'vitest'

import {
  defaultLocale,
  isLocale,
  localeFromPathSegment,
  localePrefixes,
  localizePath,
  locales,
} from '@/i18n/config'

describe('locale config', () => {
  it('uses canonical BCP 47 codes with English as the default', () => {
    expect(locales).toEqual(['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'])
    expect(defaultLocale).toBe('en')
    for (const locale of locales) {
      expect(Intl.getCanonicalLocales(locale)[0]).toBe(locale)
    }
  })

  it('maps every locale to a lowercase URL prefix', () => {
    expect(Object.values(localePrefixes)).toEqual(['/en', '/zh-hans', '/zh-hant', '/ja', '/ko'])
  })

  it('reads the locale back from the first path segment', () => {
    expect(localeFromPathSegment('zh-hans')).toBe('zh-Hans')
    expect(localeFromPathSegment('ZH-HANT')).toBe('zh-Hant')
    expect(localeFromPathSegment('ko')).toBe('ko')
    expect(localeFromPathSegment('fr')).toBeUndefined()
    expect(localeFromPathSegment(undefined)).toBeUndefined()
  })

  it('builds localized paths', () => {
    expect(localizePath('zh-Hant')).toBe('/zh-hant')
    expect(localizePath('ja', '/apps')).toBe('/ja/apps')
    expect(localizePath('en', '/apps/')).toBe('/en/apps')
  })

  it('narrows unknown values', () => {
    expect(isLocale('zh-Hans')).toBe(true)
    expect(isLocale('zh-hans')).toBe(false)
    expect(isLocale(42)).toBe(false)
  })
})
