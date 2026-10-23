import config from '@payload-config'
import { and, desc, gte, isNull } from '@payloadcms/db-postgres/drizzle'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate } from '@/lib/shanghai-day'
import { appsCacheTag } from '@/modules/apps/cache'
import { appMentions } from '@/modules/apps/schema'
import type { Media } from '@/payload-types'

import type { StoryCategory } from '../categories'
import { posterVersion, readSnapshot, type PosterSnapshot } from '../poster/snapshot'
import { DAILY_CACHE_TAG } from '../review/cache'
import { onePerEvent, sourcesOf, toHot, toItem, type HotStory, type RawStory, type StoryDetail, type StoryItem } from './story-item'

export type { HotStory, StoryDetail, StoryItem, StorySource } from './story-item'
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
export const hotShown = 5
/** The hottest story of "today" was published within this long. */
const hottestWithinMs = 24 * 3_600_000
/** Apps mentioned in stories of the last 48 hours: today in any time zone. */
const mentionsWithinMs = 48 * 3_600_000
/** The list page shows the newest poster generated for one of the last few Shanghai days. */
const posterShownDays = 7

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

// Stories of every event with heat (the heat job keeps it to the last 48 hours), hottest first.
const findHot = unstable_cache(
  async () => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { heat: { greater_than: 0 } }] },
      sort: ['-heat', '-publishedAt'],
      limit: 40,
      locale: 'all',
      depth: 0,
      select: { ...select, heat: true, heatTrend: true },
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  ['daily-hot'],
  cacheOptions,
)

export type MentionedApp = {
  id: number
  slug: string
  name: string
  logo: { url: string; width: number | null; height: number | null } | null
  /** When the newest published story about it went up; the page keeps the reader's today. */
  mentionedAt: string
}

// The apps pages' matches of published stories to published apps (src/modules/apps/metrics/mentions.ts).
const findMentionedApps = unstable_cache(
  async (): Promise<MentionedApp[]> => {
    const { payload: client, db } = await getDb()
    const rows = await db
      .select({ appId: appMentions.appId, storyId: appMentions.storyId, publishedAt: appMentions.publishedAt })
      .from(appMentions)
      .where(and(isNull(appMentions.removedAt), gte(appMentions.publishedAt, new Date(Date.now() - mentionsWithinMs))))
      .orderBy(desc(appMentions.publishedAt))
      .limit(200)
    if (!rows.length) return []
    const [stories, apps] = await Promise.all([
      client.find({
        collection: 'stories',
        where: { and: [published, { id: { in: [...new Set(rows.map((row) => row.storyId))] } }] },
        pagination: false,
        depth: 0,
        select: { slug: true },
        overrideAccess: false,
      }),
      client.find({
        collection: 'apps',
        where: { and: [published, { id: { in: [...new Set(rows.map((row) => row.appId))] } }] },
        pagination: false,
        depth: 1,
        select: { name: true, slug: true, logo: true },
        populate: { media: { url: true, width: true, height: true, sizes: true } },
        overrideAccess: false,
      }),
    ])
    const live = new Set(stories.docs.map((doc) => doc.id))
    const byId = new Map(apps.docs.map((doc) => [doc.id, doc]))
    const result: MentionedApp[] = []
    for (const row of rows) {
      const app = byId.get(row.appId)
      if (!app || !live.has(row.storyId) || result.some((item) => item.id === app.id)) continue
      result.push({ id: app.id, slug: app.slug, name: app.name, logo: logoOf(app.logo), mentionedAt: row.publishedAt.toISOString() })
    }
    return result
  },
  ['daily-mentioned-apps'],
  { tags: [DAILY_CACHE_TAG, appsCacheTag], revalidate: 3600 },
)

function logoOf(media: number | Media | null | undefined): MentionedApp['logo'] {
  if (!media || typeof media !== 'object') return null
  const thumb = media.sizes?.thumb
  const url = thumb?.url || media.url
  if (!url) return null
  return { url, width: (thumb?.url ? thumb.width : media.width) ?? null, height: (thumb?.url ? thumb.height : media.height) ?? null }
}

// Generated posters only (the visitor's access rules); the editor's generating refreshes the tag.
const findPoster = unstable_cache(
  async (date: string): Promise<PosterSnapshot | null> => {
    const { docs } = await (await payload()).find({
      collection: 'posters',
      where: { and: [{ date: { equals: date } }, { status: { equals: 'generated' } }] },
      limit: 1,
      depth: 0,
      select: { snapshot: true },
      overrideAccess: false,
    })
    const snapshot = readSnapshot(docs[0]?.snapshot)
    return snapshot?.entries.length ? snapshot : null
  },
  ['daily-poster'],
  cacheOptions,
)

const findPosterDates = unstable_cache(
  async (): Promise<string[]> => {
    const { docs } = await (await payload()).find({
      collection: 'posters',
      where: { status: { equals: 'generated' } },
      sort: '-date',
      pagination: false,
      depth: 0,
      select: { date: true },
      overrideAccess: false,
    })
    return docs.map((doc) => doc.date)
  },
  ['daily-poster-dates'],
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

/**
 * The site search's stories (docs/specs/search.md): published stories whose title or summary
 * contains the search in any language, newest first. Not cached: every search is its own query.
 */
export async function searchStories({
  locale,
  q,
  page,
  limit,
}: {
  locale: Locale
  q: string
  page: number
  limit: number
}): Promise<StoryPage> {
  const result = await (await payload()).find({
    collection: 'stories',
    where: { and: [published, { or: [{ title: { like: q } }, { summary: { like: q } }] }] },
    sort: '-publishedAt',
    page,
    limit,
    locale: 'all',
    depth: 0,
    select,
    overrideAccess: false,
  })
  const docs = result.docs as unknown as RawStory[]
  return { stories: docs.map((doc) => toItem(doc, locale)), total: result.totalDocs, page, pages: result.totalPages }
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

/**
 * A member's saved stories, in the order given (newest save first); stories no longer published
 * (withdrawn or merged) are left out. Read fresh, not from the shared cache, since every member's
 * list is different.
 */
export async function getSavedStories(ids: number[], locale: Locale): Promise<StoryItem[]> {
  if (ids.length === 0) return []
  const { docs } = await (await payload()).find({
    collection: 'stories',
    where: { and: [published, { id: { in: ids } }] },
    pagination: false,
    locale: 'all',
    depth: 0,
    select,
    overrideAccess: false,
  })
  const byId = new Map((docs as unknown as RawStory[]).map((doc) => [doc.id, doc]))
  return ids.flatMap((id) => {
    const doc = byId.get(id)
    return doc ? [toItem(doc, locale)] : []
  })
}

/** The five hottest events of the last 48 hours, one story each (the newest of its event). */
export async function hotStories(locale: Locale): Promise<HotStory[]> {
  return onePerEvent(await findHot(), hotShown).map((doc) => toHot(doc, locale))
}

/**「今日最热」: the hottest story published in the last 24 hours; null when none has heat. */
export async function hottestStory(locale: Locale, now = new Date()): Promise<HotStory | null> {
  const since = now.getTime() - hottestWithinMs
  const doc = (await findHot()).find((story) => story.publishedAt && new Date(story.publishedAt).getTime() >= since)
  return doc ? toHot(doc, locale) : null
}

/** Published apps that published stories of the last 48 hours are about, newest mention first. */
export async function mentionedApps(): Promise<MentionedApp[]> {
  return findMentionedApps()
}

/** How many sources the pipeline reads, for the list page's introduction. */
export async function sourceCount(): Promise<number> {
  return countSources()
}

/** A Shanghai day's poster as generated (what its images show); null when that day has none. */
export const getPoster = cache(async (date: string): Promise<PosterSnapshot | null> => findPoster(date))

/** The generated posters just before and after a day, for the poster page's links. */
export async function posterNeighbours(date: string): Promise<{ earlier: string | null; later: string | null }> {
  const dates = await findPosterDates()
  // Newest first: the earlier one is the first older date, the later one the last newer date.
  return { earlier: dates.find((other) => other < date) ?? null, later: [...dates].reverse().find((other) => other > date) ?? null }
}

export type PosterSummary = { date: string; count: number; version: string }

/**「每日 AI 大事」on the list page: the newest generated poster of the last week; null when there is none. */
export async function latestPoster(now = new Date()): Promise<PosterSummary | null> {
  const [date] = await findPosterDates()
  if (!date || date < shanghaiDate(new Date(now.getTime() - posterShownDays * 24 * 3_600_000))) return null
  const snapshot = await findPoster(date)
  return snapshot ? { date, count: snapshot.entries.length, version: posterVersion(snapshot) } : null
}
