import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import { inAnyLanguage } from '@/lib/i18n/localized'
import type { StoryCategory } from '@/modules/daily/categories'
import { isStoryCategory } from '@/modules/daily/public/story-item'
import type { App, Media } from '@/payload-types'

import {
  listedSince,
  newcomerDays,
  orderApps,
  trendDays,
  type Board,
  type Candidate,
  type ListHeat,
  type Sort,
} from './boards'
import { appsCacheTag } from './cache'
import {
  loadAppHeat,
  loadAppMentions,
  loadHeatHistory,
  loadLatestHeat,
  type AppHeatFigures,
  type HeatPoint,
  type LatestHeat,
} from './heat-reads'
import { inReaderLanguage, type InLanguage, type Localized } from './localized'
import { addDays } from './metrics/days'
import { isHttpUrl } from './normalize'
import { newSince } from './settings'

/**
 * Public reads for the apps pages. Every query runs with the visitor's access rules
 * (`overrideAccess: false`), so only published apps come back, and reads every language at
 * once (`locale: 'all'`): the page picks the reader's language or English and marks which.
 * Results are cached under `appsCacheTag` until an app or category changes or the heat job
 * finishes (see ./cache.ts). Boards and sorts are worked out in memory from the matching apps'
 * ids and the latest heat (./boards.ts), then only the page's apps are read in full.
 */

export const appsPerPage = 50
const alternativesShown = 6
const newcomersShown = 3
const mentionsShown = 5

export type Pricing = NonNullable<App['pricing']>
export type Platform = NonNullable<App['platforms']>[number]
export type AppImage = { url: string; width: number | null; height: number | null }
export type CategoryRef = { id: number; slug: string; name: string }
export type CategoryItem = CategoryRef & { count: number }

export type AppListItem = {
  id: number
  slug: string
  name: string
  tagline: InLanguage<string> | null
  category: CategoryRef | null
  pricing: Pricing | null
  logo: AppImage | null
}

export type { AppHeatFigures, HeatPoint } from './heat-reads'
export type { ListHeat } from './boards'

/** A list row: the app, its place in the list, its latest heat and its last 7 days. */
export type RankedApp = AppListItem & {
  place: number
  listedAt: string | null
  /** Null until the heat job has scored it (it runs once a day). */
  heat: ListHeat | null
  /** Heat on the last 8 scored days, oldest first; empty without heat. */
  trend: HeatPoint[]
}

export type AppListPage = {
  apps: RankedApp[]
  total: number
  page: number
  pages: number
  /** The latest scored day (Shanghai), the right edge of the 7-day lines; null before the first run. */
  heatDay: string | null
  /** When that day's heat was computed. */
  updatedAt: string | null
}

/** An app with its latest heat, for cards (alternatives, newcomers, the home page). */
export type HeatedApp = AppListItem & { heat: ListHeat | null; listedAt: string | null }

export type MentionItem = {
  slug: string
  title: InLanguage<string>
  /** The story's daily category; null for one this page does not know. */
  category: StoryCategory | null
  publishedAt: string
}

export type AppDetail = AppListItem & {
  website: string | null
  developer: string | null
  platforms: Platform[]
  listedAt: string | null
  /** Primary category first, then the secondary ones. */
  categories: CategoryRef[]
  description: InLanguage<string> | null
  features: InLanguage<NonNullable<App['features']>> | null
  faqs: InLanguage<NonNullable<App['faqs']>> | null
  tags: InLanguage<string[]> | null
  screenshot: AppImage | null
  /** Its figures on the latest scored day and up to 90 days before; null until the heat job has scored it. */
  heat: { latest: AppHeatFigures; history: HeatPoint[] } | null
  /** The newest published daily stories about it. */
  mentions: MentionItem[]
  alternatives: HeatedApp[]
}

/** An app as Payload returns it with `locale: 'all'` and `depth: 1`. */
type RawApp = Pick<App, 'id' | 'slug' | 'name' | 'pricing'> &
  Partial<Pick<App, 'website' | 'developer' | 'platforms' | 'listedAt'>> & {
    tagline?: Localized<string>
    description?: Localized<string>
    features?: Localized<NonNullable<App['features']>>
    faqs?: Localized<NonNullable<App['faqs']>>
    tags?: Localized<string[]>
    primaryCategory?: Ref | null
    secondaryCategories?: Ref[] | null
    logo?: number | Media | null
    screenshot?: number | Media | null
    alternatives?: Ref[] | null
  }

type Ref = number | { id: number }

const published: Where = { status: { equals: 'published' } }

/** Listed under a category: as the primary category or one of the secondary ones. */
function inCategory(id: number): Where {
  return { or: [{ primaryCategory: { equals: id } }, { secondaryCategories: { in: [id] } }] }
}

/** Name, other names, and the one-line summary and tags in any language. */
function matching(q: string): Where {
  return {
    or: [{ name: { like: q } }, { aliases: { like: q } }, { tagline: { like: q } }, { tags: { like: q } }],
  }
}

const listSelect = {
  name: true,
  slug: true,
  tagline: true,
  pricing: true,
  primaryCategory: true,
  logo: true,
  listedAt: true,
} as const

// Populated documents only bring what the cards show.
const populate = {
  'app-categories': { slug: true },
  media: { url: true, width: true, height: true, sizes: true },
  apps: { slug: true },
} as const

// Saves refresh the cache right away; the hour only bounds changes made outside Payload's hooks.
const cacheOptions = { tags: [appsCacheTag], revalidate: 3600 }

async function payload() {
  return getPayload({ config })
}

const loadCategories = unstable_cache(
  async (locale: Locale) => {
    const { docs } = await (await payload()).find({
      collection: 'app-categories',
      locale,
      sort: 'order',
      pagination: false,
      depth: 0,
      overrideAccess: false,
    })
    return docs.map(({ id, slug, name }) => ({ id, slug, name }))
  },
  ['apps-categories'],
  cacheOptions,
)

const loadCounts = unstable_cache(
  async (categoryIds: number[]) => {
    const client = await payload()
    const count = async (where: Where) =>
      (await client.count({ collection: 'apps', where, overrideAccess: false })).totalDocs
    const [total, ...perCategory] = await Promise.all([
      count(published),
      ...categoryIds.map((id) => count({ and: [published, inCategory(id)] })),
    ])
    return { total, perCategory: Object.fromEntries(categoryIds.map((id, index) => [id, perCategory[index]])) }
  },
  ['apps-counts'],
  cacheOptions,
)

/** The eight categories in display order, named in the reader's language, with published-app counts. */
export const getCategories = cache(async (locale: Locale) => {
  const categories = await loadCategories(locale)
  const counts = await loadCounts(categories.map((category) => category.id))
  return {
    total: counts.total,
    categories: categories.map((category) => ({ ...category, count: counts.perCategory[category.id] ?? 0 })),
  }
})

/** The category with this slug, named in the reader's language; null when there is none. */
export async function getCategory(slug: string, locale: Locale): Promise<CategoryItem | null> {
  const { categories } = await getCategories(locale)
  return categories.find((category) => category.slug === slug) ?? null
}

type Filter = { categoryId: number | null; q: string }

/** Id, name and listing time of every published app in the category and matching the search. */
async function findCandidates({ categoryId, q }: Filter): Promise<Candidate[]> {
  const { docs } = await (await payload()).find({
    collection: 'apps',
    where: { and: [published, ...(categoryId ? [inCategory(categoryId)] : []), ...(q ? [matching(q)] : [])] },
    pagination: false,
    locale: 'all',
    depth: 0,
    select: { name: true, listedAt: true },
    overrideAccess: false,
  })
  return docs.map((doc) => ({ id: doc.id, name: doc.name, listedAt: doc.listedAt ?? null }))
}

// Searches are not cached: every query would be its own cache entry.
const findCandidatesCached = unstable_cache(findCandidates, ['apps-candidates'], cacheOptions)

/** The published apps with these ids, in this order; unpublished ones are simply missing. */
const findAppsByIds = unstable_cache(
  async (ids: number[]) => {
    if (ids.length === 0) return []
    const { docs } = await (await payload()).find({
      collection: 'apps',
      where: { and: [published, { id: { in: ids } }] },
      limit: ids.length,
      locale: 'all',
      depth: 1,
      select: listSelect,
      populate,
      overrideAccess: false,
    })
    const byId = new Map((docs as unknown as RawApp[]).map((doc) => [doc.id, doc]))
    return ids.map((id) => byId.get(id)).filter((doc) => doc !== undefined)
  },
  ['apps-by-id'],
  cacheOptions,
)

const findApp = unstable_cache(
  async (slug: string) => {
    const { docs } = await (await payload()).find({
      collection: 'apps',
      where: { and: [published, { slug: { equals: slug } }] },
      limit: 1,
      locale: 'all',
      depth: 1,
      populate,
      overrideAccess: false,
    })
    return (docs[0] as unknown as RawApp | undefined) ?? null
  },
  ['apps-detail'],
  cacheOptions,
)

const heatOf = (latest: LatestHeat) => (id: number) => latest.apps[id]

/** The editor's picks (in their order, published only); otherwise the hottest others in the same primary category. */
async function findAlternatives(doc: RawApp): Promise<RawApp[]> {
  const chosen = (doc.alternatives ?? []).map(idOf).filter((id) => id !== null)
  if (chosen.length > 0) {
    const picked = await findAppsByIds(chosen)
    if (picked.length > 0) return picked
  }
  const categoryId = idOf(doc.primaryCategory)
  if (!categoryId) return []
  const [candidates, latest] = await Promise.all([findCandidatesCached({ categoryId, q: '' }), loadLatestHeat()])
  const hottest = orderApps(
    candidates.filter((app) => app.id !== doc.id),
    heatOf(latest),
    { board: 'top', sort: 'heat', now: new Date(), newSince: null },
  )
  return findAppsByIds(hottest.slice(0, alternativesShown).map((app) => app.id))
}

function idOf(ref: Ref | null | undefined): number | null {
  if (typeof ref === 'number') return ref
  return ref && typeof ref === 'object' ? ref.id : null
}

function imageOf(media: RawApp['logo'], size: 'thumb' | 'card'): AppImage | null {
  if (!media || typeof media !== 'object') return null
  const variant = media.sizes?.[size]
  const url = variant?.url || media.url
  if (!url) return null
  return {
    url,
    width: (variant?.url ? variant.width : media.width) ?? null,
    height: (variant?.url ? variant.height : media.height) ?? null,
  }
}

function toListItem(doc: RawApp, locale: Locale, categories: Map<number, CategoryRef>): AppListItem {
  const categoryId = idOf(doc.primaryCategory)
  return {
    id: doc.id,
    slug: doc.slug,
    name: doc.name,
    tagline: inReaderLanguage(doc.tagline, locale),
    category: (categoryId && categories.get(categoryId)) || null,
    pricing: doc.pricing ?? null,
    logo: imageOf(doc.logo, 'thumb'),
  }
}

async function categoryMap(locale: Locale) {
  const { categories } = await getCategories(locale)
  return new Map(categories.map(({ id, slug, name }) => [id, { id, slug, name }]))
}

type ListArgs = Filter & { page: number; board: Board; sort: Sort }

/** One page of a board (top, rising, new) in the order of `sort`, optionally in one category and matching a search. */
export async function listApps({ locale, categoryId, q, page, board, sort }: ListArgs & { locale: Locale }): Promise<AppListPage> {
  const filter = { categoryId, q }
  const [candidates, latest, categories] = await Promise.all([
    q ? findCandidates(filter) : findCandidatesCached(filter),
    loadLatestHeat(),
    categoryMap(locale),
  ])
  const ordered = orderApps(candidates, heatOf(latest), { board, sort, now: new Date(), newSince: newSince() })
  const start = (page - 1) * appsPerPage
  const shown = ordered.slice(start, start + appsPerPage)
  const ids = shown.map((app) => app.id)
  const [docs, history] = await Promise.all([
    findAppsByIds(ids),
    latest.day ? loadHeatHistory(ids, addDays(latest.day, -trendDays), latest.day) : ({} as Record<number, HeatPoint[]>),
  ])
  const places = new Map(ids.map((id, index) => [id, start + index + 1]))

  return {
    apps: docs.map((doc) => ({
      ...toListItem(doc, locale, categories),
      place: places.get(doc.id) ?? 0,
      listedAt: doc.listedAt ?? null,
      heat: latest.apps[doc.id] ?? null,
      trend: history[doc.id] ?? [],
    })),
    total: ordered.length,
    page,
    pages: Math.ceil(ordered.length / appsPerPage),
    heatDay: latest.day,
    updatedAt: latest.updatedAt,
  }
}

function withHeat(doc: RawApp, locale: Locale, categories: Map<number, CategoryRef>, latest: LatestHeat): HeatedApp {
  return { ...toListItem(doc, locale, categories), heat: latest.apps[doc.id] ?? null, listedAt: doc.listedAt ?? null }
}

/** 「本周新上架」: the newest apps listed in the last 7 days (and not before APPS_NEW_SINCE). */
export async function getNewcomers(locale: Locale): Promise<HeatedApp[]> {
  const [candidates, latest, categories] = await Promise.all([
    findCandidatesCached({ categoryId: null, q: '' }),
    loadLatestHeat(),
    categoryMap(locale),
  ])
  const now = new Date()
  const since = listedSince(now, newcomerDays, newSince()).getTime()
  const newest = orderApps(
    candidates.filter((app) => app.listedAt !== null && Date.parse(app.listedAt) >= since),
    heatOf(latest),
    { board: 'top', sort: 'newest', now, newSince: null },
  )
  const docs = await findAppsByIds(newest.slice(0, newcomersShown).map((app) => app.id))
  return docs.map((doc) => withHeat(doc, locale, categories, latest))
}

/**
 * The home page's apps: the hottest few for「热门应用」, and「本周精选应用」(the top riser, else
 * the hottest). Before the first heat run there is no pick and the apps come A–Z.
 */
export async function getHomeApps(locale: Locale, count: number): Promise<{ trending: HeatedApp[]; pick: HeatedApp | null }> {
  const [candidates, latest, categories] = await Promise.all([
    findCandidatesCached({ categoryId: null, q: '' }),
    loadLatestHeat(),
    categoryMap(locale),
  ])
  const options = { now: new Date(), newSince: null }
  const hottest = orderApps(candidates, heatOf(latest), { ...options, board: 'top', sort: 'heat' })
  const rising = orderApps(candidates, heatOf(latest), { ...options, board: 'rising', sort: 'change' })
  const pickId = latest.day ? (rising[0] ?? hottest[0])?.id : undefined
  const ids = hottest.slice(0, count).map((app) => app.id)
  const docs = await findAppsByIds(pickId && !ids.includes(pickId) ? [...ids, pickId] : ids)
  const items = new Map(docs.map((doc) => [doc.id, withHeat(doc, locale, categories, latest)]))
  return {
    trending: ids.map((id) => items.get(id)).filter((item) => item !== undefined),
    pick: (pickId && items.get(pickId)) || null,
  }
}

/** Where「打开网站」goes: the published app's id and website; null when there is no such app or no usable website. */
export async function getVisitTarget(slug: string): Promise<{ appId: number; website: string } | null> {
  const doc = await findApp(slug)
  if (!doc?.website || !isHttpUrl(doc.website)) return null
  return { appId: doc.id, website: doc.website }
}

/** A published app with everything its page shows; null when there is none by that slug. */
export const getApp = cache(async (slug: string, locale: Locale): Promise<AppDetail | null> => {
  const doc = await findApp(slug)
  if (!doc) return null

  const [categories, latest, alternatives, mentions] = await Promise.all([
    categoryMap(locale),
    loadLatestHeat(),
    findAlternatives(doc),
    loadAppMentions(doc.id, mentionsShown),
  ])
  const heat = latest.day ? await loadAppHeat(doc.id, latest.day) : null
  const item = toListItem(doc, locale, categories)
  const categoryIds = new Set([idOf(doc.primaryCategory), ...(doc.secondaryCategories ?? []).map(idOf)])

  return {
    ...item,
    website: doc.website && isHttpUrl(doc.website) ? doc.website : null,
    developer: doc.developer || null,
    platforms: doc.platforms ?? [],
    listedAt: doc.listedAt ?? null,
    categories: [...categoryIds].map((id) => (id ? categories.get(id) : undefined)).filter((ref) => ref !== undefined),
    description: inReaderLanguage(doc.description, locale),
    features: inReaderLanguage(doc.features, locale),
    faqs: inReaderLanguage(doc.faqs, locale),
    tags: inReaderLanguage(doc.tags, locale),
    screenshot: imageOf(doc.screenshot, 'card'),
    heat: heat?.latest ? { latest: heat.latest, history: heat.history } : null,
    mentions: mentions.map((mention) => ({
      slug: mention.slug,
      // A published story always has English; the slug only keeps a broken record from crashing the page.
      title: inAnyLanguage(mention.title, locale) ?? { value: mention.slug, lang: 'en' },
      category: isStoryCategory(mention.category) ? mention.category : null,
      publishedAt: mention.publishedAt,
    })),
    alternatives: alternatives.map((alternative) => withHeat(alternative, locale, categories, latest)),
  }
})
