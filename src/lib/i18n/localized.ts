import { defaultLocale, locales, type Locale } from '@/i18n/config'

/** A localized field read with `locale: 'all'`: one value per language, absent where never written. */
export type Localized<T> = Partial<Record<Locale, T | null>> | null | undefined

/** A value with the language it is written in, so the page can put `lang` on it. */
export type InLanguage<T> = { value: T; lang: Locale }

function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined
}

function pick<T>(field: Localized<T>, order: readonly Locale[]): InLanguage<T> | null {
  if (!field || typeof field !== 'object') return null
  for (const lang of order) {
    const value = field[lang]
    if (hasContent(value)) return { value: value as T, lang }
  }
  return null
}

/**
 * The reader's language when it has content, otherwise English — Payload's own fallback,
 * done here so the page knows when it is showing English inside another language.
 */
export function inReaderLanguage<T>(field: Localized<T>, locale: Locale): InLanguage<T> | null {
  return pick(field, locale === defaultLocale ? [locale] : [locale, defaultLocale])
}

/** Any language with content, the reader's first, for text that must show something (a title). */
export function inAnyLanguage<T>(field: Localized<T>, locale: Locale): InLanguage<T> | null {
  return pick(field, [locale, defaultLocale, ...locales.filter((item) => item !== locale && item !== defaultLocale)])
}
