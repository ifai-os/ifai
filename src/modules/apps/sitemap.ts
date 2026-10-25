import config from '@payload-config'
import { getPayload } from 'payload'

import { cached } from '@/lib/data-cache'
import type { SitemapPage } from '@/lib/sitemap'

import { appsCacheTag } from './cache'
import { getCategories } from './data'
import { listHref, submitHref } from './list-params'

const findApps = cached(
  async () => {
    const { docs } = await (await getPayload({ config })).find({
      collection: 'apps',
      where: { status: { equals: 'published' } },
      sort: '-listedAt',
      pagination: false,
      depth: 0,
      select: { slug: true, updatedAt: true },
      overrideAccess: false,
    })
    return docs.map((app) => ({ slug: app.slug, updatedAt: app.updatedAt }))
  },
  ['apps-sitemap'],
  { tags: [appsCacheTag], revalidate: 3600 },
)

/**
 * The apps pages in the sitemap: the list, categories that have apps, the submit page and
 * every published app. Searches and the other boards stay out (they are views of the same apps).
 */
export async function appsSitemap(): Promise<{ pages: SitemapPage[]; apps: SitemapPage[] }> {
  const [{ categories }, apps] = await Promise.all([getCategories('en'), findApps()])
  return {
    pages: [
      { path: listHref({}) },
      ...categories.filter((category) => category.count > 0).map((category) => ({ path: listHref({ category: category.slug }) })),
      { path: submitHref() },
    ],
    apps: apps.map((app) => ({ path: `/apps/${app.slug}` as const, lastModified: app.updatedAt })),
  }
}
