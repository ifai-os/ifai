import type { SitemapPage, SitemapSection } from '@/lib/sitemap'
import { appsSitemap } from '@/modules/apps/sitemap'
import { dailySitemap } from '@/modules/daily/public/sitemap'
import { resourcesSitemap } from '@/modules/resources/public/sitemap'

/** Every indexable page, by sitemap section: list pages together, then each module's items. */
export async function sitemapPages(): Promise<Record<SitemapSection, SitemapPage[]>> {
  const [daily, apps, resources] = await Promise.all([dailySitemap(), appsSitemap(), resourcesSitemap()])
  return {
    pages: [{ path: '/', lastModified: daily.stories[0]?.lastModified }, ...daily.pages, ...apps.pages, ...resources.pages],
    daily: daily.stories,
    apps: apps.apps,
    skills: resources.skills,
  }
}
