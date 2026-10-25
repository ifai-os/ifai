import { isLaunched } from '@/config/site'
import type { SitemapPage } from '@/lib/sitemap'

import { getArenas, getBoard } from './data'
import { boardHref } from './rules'

/**
 * The rankings in the sitemap once the third phase has launched: each published arena's board
 * (the first at /rankings), last changed when its latest snapshot was computed. Filtered boards
 * and the blind vote stay out (noindex).
 */
export async function rankingsSitemap(): Promise<SitemapPage[]> {
  if (!isLaunched('rankings')) return []
  const arenas = await getArenas('en')
  const boards = await Promise.all(arenas.map((arena) => getBoard(arena.id, 'en')))
  return arenas.map((arena, index) => ({ path: boardHref(index === 0 ? null : arena.slug), lastModified: boards[index].computedAt }))
}
