import { localizePath, type Locale } from '@/i18n/config'

import { storyCategories, type StoryCategory } from '../categories'
import { entityKey } from '../entities'
import type { StoryTag } from '../tags'

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

/** Address of a list page: every story, one category or one tag, plus the page when it is not the first. */
export function listHref({
  category,
  tag,
  page,
}: { category?: StoryCategory | null; tag?: StoryTag | null; page?: number } = {}): `/${string}` {
  const path: `/${string}` = category ? `/news/category/${category}` : tag ? `/news/tag/${tag}` : '/news'
  return page && page > 1 ? `${path}?page=${page}` : path
}

/**
 * The daily list filtered to one category in place (站长, 2026-10-27): the left column's links.
 * The category's own page (`listHref({ category })`) is where a story's category name leads.
 */
export function filterHref({ category, page }: { category?: StoryCategory | null; page?: number } = {}): `/${string}` {
  if (!category) return listHref({ page })
  return page && page > 1 ? `/news?category=${category}&page=${page}` : `/news?category=${category}`
}

/** The list's `?category=` filter: null without one, undefined when it names no category (404). */
export function readCategory(params: SearchParams): StoryCategory | null | undefined {
  const category = first(params.category)
  if (category === '') return null
  return (storyCategories as readonly string[]).includes(category) ? (category as StoryCategory) : undefined
}

export function storyHref(slug: string): `/${string}` {
  return `/news/${slug}`
}

/**
 * The topic page's key from its address: null unless it is already a compared name (so every
 * topic has one address) of a sensible length. The segment may arrive still percent-encoded.
 */
export function readTopicKey(segment: string): string | null {
  let key = segment
  try {
    if (key.includes('%')) key = decodeURIComponent(key)
  } catch {
    return null
  }
  return key.length > 0 && key.length <= 100 && entityKey(key) === key ? key : null
}

/** A company's or product's topic page, by its compared name (`entityKey`), plus the page when it is not the first. */
export function topicHref(key: string, page?: number): `/${string}` {
  const path: `/${string}` = `/news/topic/${encodeURIComponent(key)}`
  return page && page > 1 ? `${path}?page=${page}` : path
}

export const feedPath = '/news/rss.xml'

/** The poster page of a Shanghai calendar day (YYYY-MM-DD). */
export function posterHref(date: string): `/${string}` {
  return `/news/poster/${date}`
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
