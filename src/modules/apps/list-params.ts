/** Longest search passed to the database; longer input is cut. */
const maxQueryLength = 64

export type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * The list's `?q=` and `?page=`. `page` is null when it is not a whole number from 1 up,
 * so the page can answer 404 instead of showing page 1 under another address.
 */
export function readListParams(params: SearchParams): { q: string; page: number | null } {
  const q = Array.from(first(params.q).replace(/\s+/g, ' ').trim()).slice(0, maxQueryLength).join('').trim()
  const page = first(params.page)
  if (page === '') return { q, page: 1 }
  return { q, page: /^[1-9]\d{0,5}$/.test(page) ? Number(page) : null }
}

/** Address of a list page: all apps or one category, plus the search and page when set. */
export function listHref({ category, q, page }: { category?: string | null; q?: string; page?: number }): `/${string}` {
  const path: `/${string}` = category ? `/apps/category/${category}` : '/apps'
  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (page && page > 1) query.set('page', String(page))
  const search = query.toString()
  return search ? `${path}?${search}` : path
}
