import { z } from 'zod'

import { locales, localizePath, type Locale } from '@/i18n/config'
import type { InLanguage } from '@/lib/i18n/localized'

/** Parameters and address helpers the operations share. */

export const langParam = z
  .enum(locales)
  .default('en')
  .describe('Language to read in: en, zh-Hans, zh-Hant, ja or ko. Text missing in it comes in English, and `lang` says which.')

export const pageParam = z.number().int().min(1).max(10_000).default(1).describe('Page number, from 1.')

/** A page's full address in a language: `/news/x` → `https://ifai.io/zh-hans/news/x`. */
export function pageUrl(origin: string, locale: Locale, href: `/${string}`): string {
  return `${origin}${localizePath(locale, href)}`
}

/** A file's full address: media can be on this site (`/api/media/file/…`) or on R2 already. */
export function fileUrl(origin: string, url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url, origin).href
  } catch {
    return null
  }
}

/** The text of a field read in the reader's language, and that language. */
export function textOf<T>(value: InLanguage<T> | null | undefined): T | null {
  return value ? value.value : null
}

/** Whole pages for `total` items, `size` a page. */
export function pagesFor(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}
