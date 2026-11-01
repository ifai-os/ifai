import { isLaunched } from '@/config/site'
import type { SitemapPage } from '@/lib/sitemap'

import { getExternalBoards } from './data'
import { externalHref, externalSources } from './sources'

/**
 * The outside boards in the sitemap once the third phase has launched (docs/specs/rankings.md
 *「外部榜单」): each board with a published day, last changed on its newest one. Filtered tables
 * stay out (noindex).
 */
export async function externalSitemap(): Promise<SitemapPage[]> {
  if (!isLaunched('rankings')) return []
  const boards = await getExternalBoards()
  return externalSources.flatMap((source) => boards[source].map((board) => ({ path: externalHref(source, board.slug), lastModified: board.publishedOn })))
}
