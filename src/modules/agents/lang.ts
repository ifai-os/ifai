import { defaultLocale, locales, type Locale } from '@/i18n/config'

/**
 * `lang` as agents write it (docs/specs/agents.md rule 9): a site locale in any case, or the
 * usual short forms: `zh` and `zh-CN` for Simplified Chinese, `zh-TW` and `zh-HK` for Traditional.
 */
const aliases: Record<string, Locale> = {
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  'ja-jp': 'ja',
  'ko-kr': 'ko',
  'en-us': 'en',
  'en-gb': 'en',
}

/** The locale `value` names; undefined (absent) is the default, anything unknown is null. */
export function readLang(value: unknown): Locale | null {
  if (value === undefined || value === null || value === '') return defaultLocale
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase().replace(/_/g, '-')
  return locales.find((locale) => locale.toLowerCase() === key) ?? aliases[key] ?? null
}
