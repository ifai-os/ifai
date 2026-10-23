import { localizePath, type Locale } from '@/i18n/config'

import type { StoryCategory } from '../categories'

export type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * The list's `?page=`. Null when it is not a whole number from 1 up, so the page can answer
 * 404 instead of showing page 1 under another address.
 */
export function readPage(params: SearchParams): number | null {
  const page = first(params.page)
  if (page === '') return 1
  return /^[1-9]\d{0,4}$/.test(page) ? Number(page) : null
}

/** Address of a list page: every story or one category, plus the page when it is not the first. */
export function listHref({ category, page }: { category?: StoryCategory | null; page?: number } = {}): `/${string}` {
  const path: `/${string}` = category ? `/daily/category/${category}` : '/daily'
  return page && page > 1 ? `${path}?page=${page}` : path
}

export function storyHref(slug: string): `/${string}` {
  return `/daily/${slug}`
}

export const feedPath = '/daily/rss.xml'

/** The poster page of a Shanghai calendar day (YYYY-MM-DD). */
export function posterHref(date: string): `/${string}` {
  return `/daily/poster/${date}`
}

/** A poster's image in one language; `version` makes browsers fetch it again after the next generation. */
export function posterImagePath(locale: Locale, date: string, version: string): string {
  return `${localizePath(locale, `${posterHref(date)}/image.png`)}?v=${version}`
}

/** A poster date ("2026-10-21") in the reader's language; it is a Shanghai calendar day, not an instant. */
export function posterDay(date: string, locale: Locale, withYear = true): string {
  return new Intl.DateTimeFormat(locale, { year: withYear ? 'numeric' : undefined, month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}
