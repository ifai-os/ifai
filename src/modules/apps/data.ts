import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import type { App, Media } from '@/payload-types'

import { appsCacheTag } from './cache'
import { inReaderLanguage, type InLanguage, type Localized } from './localized'
import { isHttpUrl } from './normalize'

/**
 * Public reads for the apps pages. Every query runs with the visitor's access rules
 * (`overrideAccess: false`), so only published apps come back, and reads every language at
 * once (`locale: 'all'`): the page picks the reader's language or English and marks which.
 * Results are cached under `appsCacheTag` until an app or category changes (see ./cache.ts).
 */

export const appsPerPage = 50
const alternativesShown = 6

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

export type AppListPage = {
  apps: AppListItem[]
  total: number
  page: number
  pages: number
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
  alternatives: AppListItem[]
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

type ListArgs = { categoryId: number | null; q: string; page: number }

async function findApps({ categoryId, q, page }: ListArgs) {
  const result = await (await payload()).find({
    collection: 'apps',
    where: { and: [published, ...(categoryId ? [inCategory(categoryId)] : []), ...(q ? [matching(q)] : [])] },
    sort: 'name',
    page,
    limit: appsPerPage,
    locale: 'all',
    depth: 1,
    select: listSelect,
    populate,
    overrideAccess: false,
  })
  return { docs: result.docs as unknown as RawApp[], total: result.totalDocs, pages: result.totalPages }
}

// Searches are not cached: every query would be its own cache entry.
const findAppsCached = unstable_cache(findApps, ['apps-list'], cacheOptions)

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

const findAlternatives = unstable_cache(
  async (appId: number, chosen: number[], categoryId: number | null) => {
    const client = await payload()
    const find = (where: Where, limit: number) =>
      client.find({
        collection: 'apps',
        where: { and: [published, where] },
        sort: 'name',
        limit,
        locale: 'all',
        depth: 1,
        select: listSelect,
        populate,
        overrideAccess: false,
      })

    if (chosen.length > 0) {
      const { docs } = await find({ id: { in: chosen } }, chosen.length)
      // Keep the editor's order. Unpublished picks are simply missing.
      const byId = new Map((docs as unknown as RawApp[]).map((doc) => [doc.id, doc]))
      const picked = chosen.map((id) => byId.get(id)).filter((doc) => doc !== undefined)
      if (picked.length > 0) return picked
    }
    if (!categoryId) return []
    const { docs } = await find({ and: [inCategory(categoryId), { id: { not_equals: appId } }] }, alternativesShown)
    return docs as unknown as RawApp[]
  },
  ['apps-alternatives'],
  cacheOptions,
)

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

/** One page of published apps, A–Z, optionally in one category and matching a search. */
export async function listApps({ locale, ...args }: ListArgs & { locale: Locale }): Promise<AppListPage> {
  const [result, categories] = await Promise.all([
    args.q ? findApps(args) : findAppsCached(args),
    categoryMap(locale),
  ])
  return {
    apps: result.docs.map((doc) => toListItem(doc, locale, categories)),
    total: result.total,
    page: args.page,
    pages: result.pages,
  }
}

/** A published app with everything its page shows; null when there is none by that slug. */
export const getApp = cache(async (slug: string, locale: Locale): Promise<AppDetail | null> => {
  const doc = await findApp(slug)
  if (!doc) return null

  const categories = await categoryMap(locale)
  const item = toListItem(doc, locale, categories)
  const categoryIds = new Set([idOf(doc.primaryCategory), ...(doc.secondaryCategories ?? []).map(idOf)])
  const alternatives = await findAlternatives(
    doc.id,
    (doc.alternatives ?? []).map(idOf).filter((id) => id !== null),
    idOf(doc.primaryCategory),
  )

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
    alternatives: alternatives.map((alternative) => toListItem(alternative, locale, categories)),
  }
})
