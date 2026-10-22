/**
 * Single source of truth for the five interface languages.
 *
 * Locale codes are canonical BCP 47 tags and are used everywhere except the URL:
 * Payload localization, <html lang>, Intl formatting and hreflang.
 * URLs use lowercase prefixes (/zh-hans, /zh-hant) — see `localePrefixes`.
 */
export const locales = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localePrefixes = {
  en: '/en',
  'zh-Hans': '/zh-hans',
  'zh-Hant': '/zh-hant',
  ja: '/ja',
  ko: '/ko',
} as const satisfies Record<Locale, `/${string}`>

/** Native names, shown in the language menu regardless of the current locale. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  ko: '한국어',
}

/** Short labels for the header language button. */
export const localeShortNames: Record<Locale, string> = {
  en: 'EN',
  'zh-Hans': '简',
  'zh-Hant': '繁',
  ja: '日',
  ko: '한',
}

/** Open Graph wants language_TERRITORY. */
export const ogLocales: Record<Locale, string> = {
  en: 'en_US',
  'zh-Hans': 'zh_CN',
  'zh-Hant': 'zh_TW',
  ja: 'ja_JP',
  ko: 'ko_KR',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

/** messages/<name>.json */
export function messagesFileName(locale: Locale): string {
  return locale.toLowerCase()
}

/** Maps the first URL segment ("zh-hans") back to a locale ("zh-Hans"). */
export function localeFromPathSegment(segment: string | undefined): Locale | undefined {
  if (!segment) return undefined
  const prefix = `/${segment.toLowerCase()}`
  return locales.find((locale) => localePrefixes[locale] === prefix)
}

/** Prefixes a locale-less pathname ("/apps") with the locale's URL prefix. */
export function localizePath(locale: Locale, pathname = '/'): string {
  const clean = pathname === '/' ? '' : pathname.replace(/\/+$/, '')
  return `${localePrefixes[locale]}${clean}`
}
