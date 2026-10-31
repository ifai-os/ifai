import { siteUrl } from '@/lib/site-url'

import { AA_API_URL, aaRowsFrom, type AaBoard, type ExternalRow } from './sources'

/**
 * Artificial Analysis's boards from its free API (docs/specs/rankings.md「外部榜单」): the `/free`
 * lists, with the key in `x-api-key`. The free tier allows 100 requests a day; a sync takes about
 * eight. Only the newest numbers are offered (no history), so the history is the days we stored.
 */

type Fetch = typeof fetch

/** The language list comes 200 models a page; this many pages is far more than it has. */
const MAX_PAGES = 20

const userAgent = () => `IFAIBot/0.1 (+${siteUrl()})`

async function getJson(fetcher: Fetch, url: string, apiKey: string): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    headers: { 'x-api-key': apiKey, accept: 'application/json', 'user-agent': userAgent() },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const wait = response.headers.get('retry-after')
    throw new Error(`${url}: HTTP ${response.status}${response.status === 429 && wait ? ` (quota resets in ${wait} s)` : ''}`)
  }
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !Array.isArray((body as { data?: unknown }).data)) throw new Error(`${url}: no "data" list`)
  return body as Record<string, unknown>
}

/** One of Artificial Analysis's boards as it is now, with how many entries were left out and how many requests it took. */
export async function readAaBoard(
  board: AaBoard,
  apiKey: string,
  fetcher: Fetch = fetch,
): Promise<{ rows: ExternalRow[]; skipped: number; requests: number }> {
  const models: unknown[] = []
  let requests = 0
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = board.kind === 'index' ? `${AA_API_URL}${board.path}?page=${page}` : `${AA_API_URL}${board.path}`
    const body = await getJson(fetcher, url, apiKey)
    requests += 1
    models.push(...(body.data as unknown[]))
    const pagination = (body.pagination ?? {}) as { has_more?: unknown; total_pages?: unknown }
    if (board.kind !== 'index' || pagination.has_more !== true || (typeof pagination.total_pages === 'number' && page >= pagination.total_pages)) break
  }
  return { ...aaRowsFrom(board.kind, models), requests }
}
