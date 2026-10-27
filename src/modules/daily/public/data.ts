import config from '@payload-config'
import { and, desc, eq, gte, isNull, sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate } from '@/lib/shanghai-day'
import { appsCacheTag } from '@/modules/apps/cache'
import { appMentions } from '@/modules/apps/schema'
import type { Media } from '@/payload-types'

import type { StoryCategory } from '../categories'
import { entityKey, topicOf } from '../entities'
import { posterVersion, readSnapshot, type PosterSnapshot } from '../poster/snapshot'
import { DAILY_CACHE_TAG } from '../review/cache'
import { tagsOf, type StoryTag } from '../tags'
import { readTopicNames, type TopicName } from '../topic-names'
import { listPages, pageBounds } from './list-pages'
import {
  bodyOf,
  entitiesOf,
  onePerEvent,
  pickHeadline,
  sourcesOf,
  toHot,
  toItem,
  type CategoryPage,
  type HotStory,
  type RawStory,
  type StoryDetail,
  type StoryEntityItem,
  type StoryItem,
  type TopicPage,
} from './story-item'

export type { CategoryPage, HotStory, StoryDetail, StoryEntityItem, StoryItem, StorySource, StoryTopic, TopicPage } from './story-item'
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
/** 「话题追踪」keeps this many stories of the topic, this one included. */
export const topicShown = 12
/** 「同类事件」: at most this many, at least this similar (the same event starts at 0.75). */
export const similarShown = 3
const similarMin = 0.6
/** A topic page lists this many stories at a time. */
export const topicPageSize = 20
/** And a category page. */
export const categoryPageSize = 20
/** A category page's banner counts the stories of this long. */
const categoryWeekMs = 7 * 24 * 3_600_000
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
  media: true,
  tags: true,
  entities: true,
  representativeItemId: true,
  heat: true,
  heatPeak: true,
} as const

/** The story's picture comes along (depth 1), with only what the pages need; Payload builds `url` from `filename`. */
const populate = { media: { url: true, filename: true, width: true, height: true } } as const

// Part of every cache key: change it when what the queries return changes (fields added to
// `select`), so a deployment never reads entries an earlier one stored without them.
const shape = 'story-body'

// Publishing refreshes the cache right away; the hour only bounds changes made outside the review screen.
const cacheOptions = { tags: [DAILY_CACHE_TAG], revalidate: 3600 }

async function payload() {
  return getPayload({ config })
}

type ListArgs = { tag?: StoryTag | null; page: number }

// The list's pages (./list-pages.ts): published stories per UTC day, every story or one tag's.
const findListPages = cached(
  async (tag: StoryTag | null) => {
    const { db } = await getDb()
    const day = sql`to_char(coalesce(s.published_at, s.created_at) at time zone 'UTC', 'YYYY-MM-DD')`
    const rows = await db.execute<{ day: string; count: string }>(sql`
      select ${day} as day, count(*) as count from stories s
      where s.status = 'published'
        ${tag ? sql`and exists (select 1 from stories_tags t where t.parent_id = s.id and t.value = ${tag})` : sql``}
      group by 1`)
    return listPages(rows.rows.map((row) => ({ day: row.day, count: Number(row.count) })))
  },
  [shape, 'daily-list-pages'],
  cacheOptions,
)

const findStories = cached(
  async ({ tag, page }: ListArgs) => {
    const pages = await findListPages(tag ?? null)
    const range = pages[page - 1]
    if (!range) return { docs: [] as RawStory[], total: 0, pages: pages.length }
    const { since, until } = pageBounds(range)
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: {
        and: [
          published,
          { publishedAt: { greater_than_equal: since } },
          { publishedAt: { less_than: until } },
          ...(tag ? [{ tags: { contains: tag } }] : []),
        ],
      },
      sort: '-publishedAt',
      pagination: false,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    return { docs: docs as unknown as RawStory[], total: range.count, pages: pages.length }
  },
  [shape, 'daily-list'],
  cacheOptions,
)

// One page of a category's published stories, newest first (its category page).
const findCategoryPage = cached(
  async (category: StoryCategory, page: number) => {
    const result = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { category: { equals: category } }] },
      sort: '-publishedAt',
      page,
      limit: categoryPageSize,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    return { docs: result.docs as unknown as RawStory[], total: result.totalDocs, pages: result.totalPages }
  },
  [shape, 'daily-category-page'],
  cacheOptions,
)

// A category page's banner: its stories of the last 7 days, counted when the cache fills (so up to
// an hour behind as stories age out), and when the newest went up.
const findCategorySummary = cached(
  async (category: StoryCategory) => {
    const client = await payload()
    const inCategory: Where[] = [published, { category: { equals: category } }]
    const since = new Date(Date.now() - categoryWeekMs).toISOString()
    const [week, newest] = await Promise.all([
      client.count({
        collection: 'stories',
        where: { and: [...inCategory, { publishedAt: { greater_than_equal: since } }] },
        overrideAccess: false,
      }),
      client.find({
        collection: 'stories',
        where: { and: inCategory },
        sort: '-publishedAt',
        limit: 1,
        depth: 0,
        select: { publishedAt: true, createdAt: true },
        overrideAccess: false,
      }),
    ])
    const doc = newest.docs[0]
    return { week: week.totalDocs, latest: doc ? (doc.publishedAt ?? doc.createdAt) : null }
  },
  [shape, 'daily-category-summary'],
  cacheOptions,
)

const findLatest = cached(
  async (limit: number) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: published,
      sort: '-publishedAt',
      limit,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  [shape, 'daily-latest'],
  cacheOptions,
)

const findStory = cached(
  async (slug: string) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { slug: { equals: slug } }] },
      limit: 1,
      locale: 'all',
      depth: 1,
      populate,
      // Only the story's own page reads the body; lists leave it out.
      select: { ...select, body: true },
      overrideAccess: false,
    })
    return (docs[0] as unknown as RawStory | undefined) ?? null
  },
  [shape, 'daily-story'],
  cacheOptions,
)

const findDevelopments = cached(
  async (eventId: number, storyId: number) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { eventId: { equals: eventId } }, { id: { not_equals: storyId } }] },
      sort: '-publishedAt',
      limit: developmentsShown,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  [shape, 'daily-developments'],
  cacheOptions,
)

// Published stories about the same product or company (`stories.entities.key`), newest first.
const findTopic = cached(
  async (key: string) => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { 'entities.key': { equals: key } }] },
      sort: '-publishedAt',
      limit: topicShown,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  [shape, 'daily-topic'],
  cacheOptions,
)

// One page of the published stories about a company or product, newest first (its topic page).
const findTopicPage = cached(
  async (key: string, page: number) => {
    const result = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { 'entities.key': { equals: key } }] },
      sort: '-publishedAt',
      page,
      limit: topicPageSize,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    return { docs: result.docs as unknown as RawStory[], total: result.totalDocs, pages: result.totalPages }
  },
  [shape, 'daily-topic-page'],
  cacheOptions,
)

// Published apps by their compared names (name and aliases), so a topic page can say which app it is.
const findTopicApps = cached(
  async () => {
    const { docs } = await (await payload()).find({
      collection: 'apps',
      where: published,
      pagination: false,
      depth: 1,
      select: { name: true, slug: true, aliases: true, developer: true, logo: true },
      populate: { media: { url: true, filename: true, width: true, height: true, sizes: true } },
      overrideAccess: false,
    })
    return docs.map((app) => ({
      keys: [app.name, ...(app.aliases ?? [])].map(entityKey).filter(Boolean),
      slug: app.slug,
      name: app.name,
      developer: app.developer?.trim() || null,
      logo: logoOf(app.logo),
    }))
  },
  [shape, 'daily-topic-apps'],
  { tags: [DAILY_CACHE_TAG, appsCacheTag], revalidate: 3600 },
)

// Published stories whose report reads most like this one's (pgvector, step 6's embeddings): one per
// event, the closest, leaving out the given events.
const findSimilar = cached(
  async (itemId: number, leaveOut: number[]) => {
    const { payload: client, db } = await getDb()
    const distance = sql`mine.embedding <=> theirs.embedding`
    const events = sql.join(
      leaveOut.map((id) => sql`${id}`),
      sql`, `,
    )
    const rows = await db.execute<{ id: number }>(sql`
      select id from (
        select distinct on (s.event_id) s.id, ${distance} as distance from stories s
        join raw_items theirs on theirs.id = s.representative_item_id
        join raw_items mine on mine.id = ${itemId}
        where s.status = 'published' and s.event_id not in (${events})
          and mine.embedding is not null and theirs.embedding is not null
          and 1 - (${distance}) >= ${similarMin}
        order by s.event_id, ${distance}
      ) closest
      order by distance
      limit ${similarShown}`)
    const ids = rows.rows.map((row) => Number(row.id))
    if (!ids.length) return []
    const { docs } = await client.find({
      collection: 'stories',
      where: { and: [published, { id: { in: ids } }] },
      pagination: false,
      locale: 'all',
      depth: 1,
      populate,
      select,
      overrideAccess: false,
    })
    const byId = new Map((docs as unknown as RawStory[]).map((doc) => [doc.id, doc]))
    return ids.flatMap((id) => byId.get(id) ?? [])
  },
  [shape, 'daily-similar'],
  cacheOptions,
)

// The published apps the apps module matched to this story, with the name the match was made on.
const findStoryApps = cached(
  async (storyId: number) => {
    const { payload: client, db } = await getDb()
    const rows = await db
      .select({ appId: appMentions.appId, matched: appMentions.matched })
      .from(appMentions)
      .where(and(eq(appMentions.storyId, storyId), isNull(appMentions.removedAt)))
    if (!rows.length) return []
    const { docs } = await client.find({
      collection: 'apps',
      where: { and: [published, { id: { in: [...new Set(rows.map((row) => row.appId))] } }] },
      pagination: false,
      depth: 0,
      select: { name: true, slug: true },
      overrideAccess: false,
    })
    const byId = new Map(docs.map((doc) => [doc.id, doc]))
    return rows.flatMap((row) => {
      const app = byId.get(row.appId)
      // A match by the source's address names no product, so the app's own name counts too.
      return app ? [{ keys: [entityKey(row.matched), entityKey(app.name)], slug: app.slug, name: app.name }] : []
    })
  },
  [shape, 'daily-story-apps'],
  { tags: [DAILY_CACHE_TAG, appsCacheTag], revalidate: 3600 },
)

// Stories of every event with heat (the heat job keeps it to the last 48 hours), highest reach index first.
const findHot = cached(
  async () => {
    const { docs } = await (await payload()).find({
      collection: 'stories',
      where: { and: [published, { heat: { greater_than: 0 } }] },
      sort: ['-heatPeak', '-heat', '-publishedAt'],
      limit: 40,
      locale: 'all',
      depth: 1,
      populate,
      select: { ...select, heatTrend: true },
      overrideAccess: false,
    })
    return docs as unknown as RawStory[]
  },
  [shape, 'daily-hot'],
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
const findMentionedApps = cached(
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
  [shape, 'daily-mentioned-apps'],
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
const findPoster = cached(
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
  [shape, 'daily-poster'],
  cacheOptions,
)

const findPosterDates = cached(
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
  [shape, 'daily-poster-dates'],
  cacheOptions,
)

/** One page of published stories, newest first, optionally with one tag. */
export async function listStories({ locale, ...args }: ListArgs & { locale: Locale }): Promise<StoryPage> {
  const result = await findStories(args)
  return { stories: result.docs.map((doc) => toItem(doc, locale)), total: result.total, page: args.page, pages: result.pages }
}

/**
 * A category page (docs/specs/daily.md「分类与分类页」): one page of its published stories, newest
 * first, how many went up in the last 7 days and when the newest did; null past the last page.
 * A category without stories yet still has a page (its empty state).
 */
export async function getCategoryPage(category: StoryCategory, page: number, locale: Locale): Promise<CategoryPage | null> {
  const [result, summary] = await Promise.all([findCategoryPage(category, page), findCategorySummary(category)])
  if (page > 1 && result.docs.length === 0) return null
  return {
    category,
    total: result.total,
    page,
    pages: result.pages,
    stories: result.docs.map((doc) => toItem(doc, locale)),
    week: summary.week,
    latest: summary.latest,
  }
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
    depth: 1,
    populate,
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

/**
 * A published story with its sources, the other stories of its event, its tags, companies and
 * products, its topic and similar events (docs/specs/daily.md「详情页：…」); null when there is
 * none by that slug.
 */
export const getStory = cache(async (slug: string, locale: Locale): Promise<StoryDetail | null> => {
  const doc = await findStory(slug)
  if (!doc) return null
  const entities = entitiesOf(doc, entityKey)
  const topic = topicOf(entities)
  const [developments, topicStories, apps] = await Promise.all([
    findDevelopments(doc.eventId, doc.id),
    topic ? findTopic(topic.key) : [],
    entities.length ? findStoryApps(doc.id) : [],
  ])
  // 「同类事件」are other events, each listed once, and not the ones the topic already lists.
  const similar = await findSimilar(doc.representativeItemId, [...new Set([doc.eventId, ...topicStories.map((other) => other.eventId)])])
  return {
    ...toItem(doc, locale),
    body: bodyOf(doc, locale),
    sources: sourcesOf(doc),
    developments: developments.map((other) => toItem(other, locale)),
    tags: tagsOf(doc.tags),
    entities: entities.map(({ name, kind, key }): StoryEntityItem => {
      const app = apps.find((match) => match.keys.includes(key))
      return { name, kind, key, app: app ? { slug: app.slug, name: app.name } : null }
    }),
    topic:
      topic && topicStories.some((other) => other.id !== doc.id)
        ? { name: topic.name, key: topic.key, stories: topicStories.map((other) => toItem(other, locale)) }
        : null,
    similar: similar.map((other) => toItem(other, locale)),
  }
})

/**
 * A company's or product's topic page (docs/specs/daily.md「公司与产品的话题页」); null when no
 * published story is about it, or the page is past the last.
 */
export const getTopicPage = cache(async (key: string, page: number, locale: Locale): Promise<TopicPage | null> => {
  const [result, first, apps] = await Promise.all([findTopicPage(key, page), page === 1 ? null : findTopicPage(key, 1), findTopicApps()])
  const newest = (first ?? result).docs[0]
  const entity = newest && entitiesOf(newest, entityKey).find((item) => item.key === key)
  if (!entity || result.docs.length === 0) return null
  const app = apps.find((match) => match.keys.includes(key)) ?? null
  // Only a product's app says who made it; stories naming both do not.
  const developerName = entity.kind === 'product' ? app?.developer : null
  const developerKey = developerName ? entityKey(developerName) : ''
  const developerHasPage = developerKey && developerKey !== key ? (await findTopicPage(developerKey, 1)).total > 0 : false
  return {
    key,
    name: entity.name,
    kind: entity.kind,
    total: result.total,
    page,
    pages: result.pages,
    stories: result.docs.map((doc) => toItem(doc, locale)),
    earlier: Math.max(0, result.total - (page - 1) * topicPageSize - result.docs.length),
    app: app ? { slug: app.slug, name: app.name, logo: app.logo } : null,
    developer: developerName ? { name: developerName, key: developerHasPage ? developerKey : null } : null,
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
    depth: 1,
    populate,
    select,
    overrideAccess: false,
  })
  const byId = new Map((docs as unknown as RawStory[]).map((doc) => [doc.id, doc]))
  return ids.flatMap((id) => {
    const doc = byId.get(id)
    return doc ? [toItem(doc, locale)] : []
  })
}

/**
 * 「我的关注」(docs/specs/daily.md「关注」): one page of the published stories with any of the
 * tags or about any of the companies and products, newest first. Read fresh, not from the shared
 * cache, since every member's is different.
 */
export async function followedStories({
  locale,
  tags,
  keys,
  page,
}: {
  locale: Locale
  tags: readonly StoryTag[]
  keys: readonly string[]
  page: number
}): Promise<StoryPage> {
  const any: Where[] = [...(tags.length ? [{ tags: { in: [...tags] } }] : []), ...(keys.length ? [{ 'entities.key': { in: [...keys] } }] : [])]
  if (any.length === 0) return { stories: [], total: 0, page, pages: 0 }
  const result = await (await payload()).find({
    collection: 'stories',
    where: { and: [published, { or: any }] },
    sort: '-publishedAt',
    page,
    limit: storiesPerPage,
    locale: 'all',
    depth: 1,
    populate,
    select,
    overrideAccess: false,
  })
  const docs = result.docs as unknown as RawStory[]
  return { stories: docs.map((doc) => toItem(doc, locale)), total: result.totalDocs, page, pages: result.totalPages }
}

/** The names of the companies and products with these keys, as their newest published stories write them. */
export async function topicNames(keys: readonly string[]): Promise<Map<string, TopicName>> {
  const { db } = await getDb()
  return readTopicNames(db, keys)
}

/** The five events of the last 48 hours with the highest reach index (传播指数), one story each (the newest of its event). */
export async function hotStories(locale: Locale): Promise<HotStory[]> {
  return onePerEvent(await findHot(), hotShown).map((doc) => toHot(doc, locale))
}

/**
 *「头条」: the hottest story published in the last 24 hours; when none of them has heat yet, the
 * hottest of the last 48, else the newest published story. Null only when nothing is published.
 */
export async function hottestStory(locale: Locale, now = new Date()): Promise<HotStory | null> {
  const hot = await findHot()
  const doc = pickHeadline(hot, hot.length ? [] : await findLatest(1), now, hottestWithinMs)
  return doc ? toHot(doc, locale) : null
}

/** Published apps that published stories of the last 48 hours are about, newest mention first. */
export async function mentionedApps(): Promise<MentionedApp[]> {
  return findMentionedApps()
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
