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
