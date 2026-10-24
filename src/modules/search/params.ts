import { visibleKinds, type SearchKind } from './kinds'

/** Longest search passed on; longer input is cut (the same as the apps and Skills lists). */
export const maxQueryLength = 64

export type SearchParams = Record<string, string | string[] | undefined>

/** `all` shows a few of each kind; a kind shows all of its own, a page at a time. */
export type SearchType = 'all' | SearchKind

export type SiteSearchParams = {
  q: string
  type: SearchType
  /** Null when `?page=` is not a whole number from 1 up, so the page can answer 404. */
  page: number | null
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** The search as typed, tidied: outer spaces dropped, inner runs of spaces made one, at most 64 characters. */
export function cleanQuery(value: string): string {
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, maxQueryLength).join('').trim()
}

/** `?q=`, `?type=` and `?page=` of the search page; an unknown type, or one whose module has not launched, is「全部」. */
export function readSearchParams(params: SearchParams): SiteSearchParams {
  const type = first(params.type)
  const page = first(params.page)
  return {
    q: cleanQuery(first(params.q)),
    type: (visibleKinds() as readonly string[]).includes(type) ? (type as SearchKind) : 'all',
    page: page === '' ? 1 : /^[1-9]\d{0,5}$/.test(page) ? Number(page) : null,
  }
}

/** Address of the search page, leaving out every default. */
export function searchHref({ q, type = 'all', page }: { q?: string; type?: SearchType; page?: number } = {}): `/${string}` {
  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (type !== 'all') query.set('type', type)
  if (page && page > 1) query.set('page', String(page))
  const search = query.toString()
  return search ? `/search?${search}` : '/search'
}
