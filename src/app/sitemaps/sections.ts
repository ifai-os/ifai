import type { SitemapPage, SitemapSection } from '@/lib/sitemap'
import { appsSitemap } from '@/modules/apps/sitemap'
import { legalDocuments, legalHref } from '@/modules/legal/documents'
import { dailySitemap } from '@/modules/daily/public/sitemap'
import { rankingsSitemap } from '@/modules/rankings/sitemap'
import { resourcesSitemap } from '@/modules/resources/public/sitemap'

/** Every indexable page, by sitemap section: list pages together, then each module's items. */
export async function sitemapPages(): Promise<Record<SitemapSection, SitemapPage[]>> {
  const [daily, apps, resources, rankings] = await Promise.all([dailySitemap(), appsSitemap(), resourcesSitemap(), rankingsSitemap()])
  return {
    pages: [{ path: '/', lastModified: daily.stories[0]?.lastModified }, ...daily.pages, ...apps.pages, ...rankings, ...resources.pages, ...legalDocuments.map((document) => ({ path: legalHref[document] }))],
    daily: daily.stories,
    apps: apps.apps,
    skills: resources.skills,
  }
}
