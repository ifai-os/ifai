import { boards, defaultSorts, sorts, type Board, type Sort } from './boards'

/** Longest search passed to the database; longer input is cut. */
const maxQueryLength = 64

export type SearchParams = Record<string, string | string[] | undefined>

export type ListParams = { q: string; page: number | null; board: Board; sort: Sort }

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * The list's `?q=`, `?page=`, `?board=` and `?sort=`. `page` is null when it is not a whole
 * number from 1 up, so the page can answer 404 instead of showing page 1 under another
 * address. An unknown board or sort falls back to the default one.
 */
export function readListParams(params: SearchParams): ListParams {
  const q = Array.from(first(params.q).replace(/\s+/g, ' ').trim()).slice(0, maxQueryLength).join('').trim()
  const board = oneOf(first(params.board), boards, 'top')
  const sort = oneOf(first(params.sort), sorts, defaultSorts[board])
  const page = first(params.page)
  if (page === '') return { q, page: 1, board, sort }
  return { q, page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : null, board, sort }
}

type ListHref = { category?: string | null; q?: string; page?: number; board?: Board; sort?: Sort }

/** Address of a list page: all apps or one category, plus the search, board, sort and page when not the default. */
export function listHref({ category, q, page, board = 'top', sort }: ListHref): `/${string}` {
  const path: `/${string}` = category ? `/apps/category/${category}` : '/apps'
  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (board !== 'top') query.set('board', board)
  if (sort && sort !== defaultSorts[board]) query.set('sort', sort)
  if (page && page > 1) query.set('page', String(page))
  const search = query.toString()
  return search ? `${path}?${search}` : path
}
