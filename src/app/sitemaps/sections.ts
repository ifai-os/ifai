import { isLaunched } from '@/config/site'
import type { SitemapPage, SitemapSection } from '@/lib/sitemap'
import { appsSitemap } from '@/modules/apps/sitemap'
import { legalDocuments, legalHref } from '@/modules/legal/documents'
import { dailySitemap } from '@/modules/daily/public/sitemap'
import { externalSitemap } from '@/modules/rankings/external/sitemap'
import { rankingsSitemap } from '@/modules/rankings/sitemap'
import { recommendSitemap } from '@/modules/recommend/sitemap'
import { resourcesSitemap } from '@/modules/resources/public/sitemap'

/** Every indexable page, by sitemap section: list pages together, then each module's items. */
export async function sitemapPages(): Promise<Record<SitemapSection, SitemapPage[]>> {
  const [daily, apps, resources, rankings, external, recommend] = await Promise.all([
    dailySitemap(),
    appsSitemap(),
    resourcesSitemap(),
    rankingsSitemap(),
    externalSitemap(),
    recommendSitemap(),
  ])
  // The circles page from phase two; its circle filters and tabs are noindex.
  const circles: SitemapPage[] = isLaunched('circles') ? [{ path: '/circles' }] : []
  return {
    pages: [
      { path: '/', lastModified: daily.stories[0]?.lastModified },
      ...daily.pages,
      ...apps.pages,
      ...rankings,
      ...external,
      ...resources.pages,
      ...circles,
      // From phase two; the articles are few, so they share this section.
      ...recommend.pages,
      ...recommend.articles,
      ...legalDocuments.map((document) => ({ path: legalHref[document] })),
    ],
    daily: daily.stories,
    apps: apps.apps,
    skills: resources.skills,
  }
}
