import config from '@payload-config'
import { getPayload } from 'payload'

import { cached } from '@/lib/data-cache'
import type { SitemapPage } from '@/lib/sitemap'

import { storyCategories } from '../categories'
import { readSnapshot } from '../poster/snapshot'
import { DAILY_CACHE_TAG } from '../review/cache'
import { listHref, posterHref, storyHref } from './list-params'

/**
 * The daily pages in the sitemap: the list, its categories, generated posters and every
 * published story, newest first. Same visitor access rules and cache tag as ./data.ts, so a
 * withdrawn story leaves the sitemap when it leaves the pages.
 */
export const dailySitemap = cached(
  async (): Promise<{ pages: SitemapPage[]; stories: SitemapPage[] }> => {
    const payload = await getPayload({ config })
    const [stories, posters] = await Promise.all([
      payload.find({
        collection: 'stories',
        where: { status: { equals: 'published' } },
        sort: '-publishedAt',
        pagination: false,
        depth: 0,
        select: { slug: true, publishedAt: true, approvedAt: true, correctedAt: true },
        overrideAccess: false,
      }),
      payload.find({
        collection: 'posters',
        where: { status: { equals: 'generated' } },
        sort: '-date',
        pagination: false,
        depth: 0,
        select: { date: true, snapshot: true },
        overrideAccess: false,
      }),
    ])
    // A page changes when its story goes up, which for a story added late is long after the news's own time.
    const upAt = (story: (typeof stories.docs)[number]) => story.approvedAt ?? story.publishedAt
    const newestStory = stories.docs.map(upAt).filter(Boolean).sort().at(-1) ?? null

    return {
      pages: [
        { path: listHref(), lastModified: newestStory },
        ...storyCategories.map((category) => ({ path: listHref({ category }) })),
        // A poster whose stories were all withdrawn has no page (data.ts findPoster).
        ...posters.docs.flatMap((poster) => {
          const snapshot = readSnapshot(poster.snapshot)
          return snapshot?.entries.length ? [{ path: posterHref(poster.date), lastModified: snapshot.updatedAt }] : []
        }),
      ],
      stories: stories.docs.map((story) => ({ path: storyHref(story.slug), lastModified: story.correctedAt ?? upAt(story) })),
    }
  },
  ['daily-sitemap'],
  { tags: [DAILY_CACHE_TAG], revalidate: 3600 },
)
