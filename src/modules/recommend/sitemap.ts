import type { SitemapPage } from '@/lib/sitemap'

import { publishedArticles } from './data'
import { articleHref, recommendLaunched } from './rules'

/**
 * Once phase two has launched: the list, last changed with its newest article, and each published
 * article at its one address, in the language it is written in. Filtered lists stay out (noindex).
 */
export async function recommendSitemap(): Promise<{ pages: SitemapPage[]; articles: SitemapPage[] }> {
  if (!recommendLaunched()) return { pages: [], articles: [] }
  const articles = await publishedArticles()
  return {
    pages: [{ path: '/recommend', lastModified: articles[0]?.publishedAt }],
    articles: articles.map((article) => ({ path: articleHref(article.id), lastModified: article.updatedAt, only: article.lang })),
  }
}
