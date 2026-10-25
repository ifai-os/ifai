import { isLaunched } from '@/config/site'
import { sitemapSections, type SitemapPage, type SitemapSection } from '@/lib/sitemap'
import { appsSitemap } from '@/modules/apps/sitemap'
import { legalDocuments, legalHref } from '@/modules/legal/documents'
import { dailySitemap } from '@/modules/daily/public/sitemap'
import { rankingsSitemap } from '@/modules/rankings/sitemap'
import { resourcesSitemap } from '@/modules/resources/public/sitemap'
import { wikiSitemap } from '@/modules/wiki/sitemap'

/** Every indexable page, by sitemap section: list pages together, then each module's items. */
export async function sitemapPages(): Promise<Record<SitemapSection, SitemapPage[]>> {
  const [daily, apps, resources, rankings, wiki] = await Promise.all([dailySitemap(), appsSitemap(), resourcesSitemap(), rankingsSitemap(), wikiSitemap()])
  // The circles page from phase two; its circle filters and tabs are noindex.
  const circles: SitemapPage[] = isLaunched('circles') ? [{ path: '/circles' }] : []
  return {
    pages: [
      { path: '/', lastModified: daily.stories[0]?.lastModified },
      ...daily.pages,
      ...apps.pages,
      ...rankings,
      ...resources.pages,
      ...circles,
      ...wiki.pages,
      ...legalDocuments.map((document) => ({ path: legalHref[document] })),
    ],
    daily: daily.stories,
    apps: apps.apps,
    skills: resources.skills,
    wiki: wiki.entries,
  }
}

/** The sections the index lists: the Wiki's only once it has launched (docs/specs/wiki.md, rule 11). */
export function listedSections(): SitemapSection[] {
  return sitemapSections.filter((section) => section !== 'wiki' || isLaunched('wiki'))
}
