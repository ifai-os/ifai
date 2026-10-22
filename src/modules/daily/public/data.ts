import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'

import type { StoryCategory } from '../categories'
import { DAILY_CACHE_TAG } from '../review/cache'
import { sourcesOf, toItem, type RawStory, type StoryDetail, type StoryItem } from './story-item'

export type { StoryDetail, StoryItem, StorySource } from './story-item'
export { isStoryCategory } from './story-item'

/**
 * Public reads for the daily pages, the home page and the RSS feeds. Every query runs with
 * the visitor's access rules (`overrideAccess: false`), so only published stories come back,
 * and reads every language at once (`locale: 'all'`): the page picks the reader's language or
 * English and marks which. Results are cached under `DAILY_CACHE_TAG` until the editor
 * publishes, corrects, merges or withdraws a story (see ../review/cache.ts).
 */

export const storiesPerPage = 30
export const feedLength = 50
export const developmentsShown = 10

export type StoryPage = { stories: StoryItem[]; total: number; page: number; pages: number }

const published: Where = { status: { equals: 'published' } }

const select = {
  slug: true,
  title: true,
  summary: true,
  tryIt: true,
  category: true,
  sources: true,
  eventId: true,
  publishedAt: true,
  correctedAt: true,
  createdAt: true,
} as const

// Publishing refreshes the cache right away; the hour only bounds changes made outside the review screen.
const cacheOptions = { tags: [DAILY_CACHE_TAG], revalidate: 3600 }

async function payload() {
  return getPayload({ config })
}

type ListArgs = { category: StoryCategory | null; page: number }

const findStories = unstable_cache(
  async ({ category, page }: ListArgs) => {
    const result = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, ...(category ? [{ category: { equals: category } }] : [])] },
      sort: '-publishedAt',
      page,
      limit: storiesPerPage,
      locale: 'all',
      depth: 0,
      select,
      overrideAccess: false,
    })
    return { docs: result.docs as unknown as RawStory[], total: result.totalDocs, pages: result.totalPages }
  },
  ['daily-list'],
  cacheOptions,
)

const findLatest = unstable_cache(
  async (limit: number) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: published,
      sort: '-publishedAt',
      limit,
      locale: 'all',
      depth: 0,
      select,
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  ['daily-latest'],
  cacheOptions,
)

const findStory = unstable_cache(
  async (slug: string) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { slug: { equals: slug } }] },
      limit: 1,
      locale: 'all',
      depth: 0,
      select,
      overrideAccess: false,
    })
    return (docs[0] as unknown as RawStory | undefined) ?? null
  },
  ['daily-story'],
  cacheOptions,
)

const findDevelopments = unstable_cache(
  async (eventId: number, storyId: number) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { eventId: { equals: eventId } }, { id: { not_equals: storyId } }] },
      sort: '-publishedAt',
      limit: developmentsShown,
      locale: 'all',
      depth: 0,
      select,
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  ['daily-developments'],
  cacheOptions,
)

const countSources = unstable_cache(
  async () => (await (await payload()).count({ collection: 'sources', where: { enabled: { equals: true } } })).totalDocs,
  ['daily-sources-count'],
  cacheOptions,
)

/** One page of published stories, newest first, optionally in one category. */
export async function listStories({ locale, ...args }: ListArgs & { locale: Locale }): Promise<StoryPage> {
  const result = await findStories(args)
  return { stories: result.docs.map((doc) => toItem(doc, locale)), total: result.total, page: args.page, pages: result.pages }
}

/** The newest published stories, for the home page and the feeds. */
export async function latestStories(locale: Locale, limit: number): Promise<StoryItem[]> {
  return (await findLatest(limit)).map((doc) => toItem(doc, locale))
}

/** A published story with its sources and the other stories of its event; null when there is none by that slug. */
export const getStory = cache(async (slug: string, locale: Locale): Promise<StoryDetail | null> => {
  const doc = await findStory(slug)
  if (!doc) return null
  const developments = await findDevelopments(doc.eventId, doc.id)
  return {
    ...toItem(doc, locale),
    sources: sourcesOf(doc),
    developments: developments.map((other) => toItem(other, locale)),
  }
})

/** How many sources the pipeline reads, for the list page's introduction. */
export async function sourceCount(): Promise<number> {
  return countSources()
}
