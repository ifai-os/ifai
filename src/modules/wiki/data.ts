import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { inAnyLanguage, inReaderLanguage, type InLanguage, type Localized } from '@/lib/i18n/localized'
import { shanghaiDate } from '@/lib/shanghai-day'
import { appsCacheTag } from '@/modules/apps/cache'
import { getSavedApps, type AppImage } from '@/modules/apps/data'
import { getSavedStories } from '@/modules/daily/public/data'
import { DAILY_CACHE_TAG } from '@/modules/daily/review/cache'
import { skillsCacheTag } from '@/modules/resources/public/cache'
import { getSavedSkills } from '@/modules/resources/public/data'
import { namesFirst } from '@/modules/search/rank'
import type { WikiEntry, WikiTopic } from '@/payload-types'

import { wikiCacheTag } from './cache'
import { gatherRelations, isEntryType, otherNames, pickOfTheDay, type EntryType, type StoredRelations } from './rules'

/**
 * Public reads for the Wiki pages (docs/specs/wiki.md「页面与路由」). Published entries and every
 * topic are read in all languages at once and cached under `wikiCacheTag` until an entry or a
 * topic changes. The Wiki is small (dozens to hundreds of entries), so lists, relations and
 * search are worked out in memory from that one read.
 */

export const entriesPerPage = 30
const newestShown = 10
const factsShown = 5
const mustReadOnCard = 4

export type TopicRef = { id: number; slug: string; name: InLanguage<string> }

/** An entry wherever another page lists it: name, type and its one-sentence definition. */
export type EntryRef = {
  id: number
  slug: string
  type: EntryType
  title: InLanguage<string>
  definition: InLanguage<string> | null
}

export type TopicCard = TopicRef & {
  intro: InLanguage<string> | null
  count: number
  /** The first few to read: the editor's order, or the newest when none are picked. */
  mustRead: EntryRef[]
}

export type WikiHome = {
  entries: number
  types: Record<EntryType, number>
  topics: TopicCard[]
  featured: EntryRef | null
  newest: EntryRef[]
  facts: { fact: InLanguage<string>; entry: EntryRef }[]
}

export type TopicDetail = TopicCard & {
  concepts: EntryRef[]
  methods: EntryRef[]
}

export type EntriesPage = { entries: (EntryRef & { topics: TopicRef[] })[]; total: number; page: number; pages: number }

export type FurtherApp = { slug: string; name: string; tagline: InLanguage<string> | null; logo: AppImage | null }
export type FurtherSkill = { slug: string; name: InLanguage<string>; tagline: InLanguage<string> | null }
export type FurtherStory = { slug: string; title: InLanguage<string>; publishedAt: string }

export type EntryDetail = EntryRef & {
  /** Other names: the English one on a page in another language, then the aliases. None repeats the title. */
  otherNames: InLanguage<string>[]
  explanation: InLanguage<string> | null
  examples: InLanguage<{ title?: string | null; text: string }[]> | null
  steps: InLanguage<{ title: string; detail?: string | null }[]> | null
  uses: InLanguage<string> | null
  limitations: InLanguage<string> | null
  contexts: InLanguage<{ label: string; meaning: string }[]> | null
  topics: TopicRef[]
  prerequisites: EntryRef[]
  next: EntryRef[]
  related: EntryRef[]
  comparisons: { entry: EntryRef; difference: InLanguage<string> }[]
  sources: { title: string; url: string; publisher: string | null }[]
  reviewedAt: string | null
  publishedAt: string | null
  updatedAt: string
  apps: FurtherApp[]
  skills: FurtherSkill[]
  stories: FurtherStory[]
}

type Ref = number | { id: number } | null | undefined

function idOf(ref: Ref): number | null {
  if (typeof ref === 'number') return ref
  return ref && typeof ref === 'object' ? ref.id : null
}

function idsOf(refs: readonly Ref[] | null | undefined): number[] {
  return (refs ?? []).map(idOf).filter((id) => id !== null)
}

type Comparison = { entry: Ref; difference: string }

/** An entry as Payload returns it with `locale: 'all'`. */
type RawEntry = Omit<
  WikiEntry,
  'title' | 'aliases' | 'definition' | 'explanation' | 'examples' | 'steps' | 'uses' | 'limitations' | 'contexts' | 'fact' | 'comparisons'
> & {
  title: Localized<string>
  aliases?: Localized<string[]>
  definition?: Localized<string>
  explanation?: Localized<string>
  examples?: Localized<NonNullable<WikiEntry['examples']>>
  steps?: Localized<NonNullable<WikiEntry['steps']>>
  uses?: Localized<string>
  limitations?: Localized<string>
  contexts?: Localized<NonNullable<WikiEntry['contexts']>>
  fact?: Localized<string>
  comparisons?: Localized<Comparison[]>
}

type RawTopic = Omit<WikiTopic, 'name' | 'intro'> & { name: Localized<string>; intro?: Localized<string> }

const cacheOptions = { tags: [wikiCacheTag], revalidate: 3600 }

async function payload() {
  return getPayload({ config })
}

const catalogSelect = {
  title: true,
  slug: true,
  type: true,
  aliases: true,
  definition: true,
  fact: true,
  featured: true,
  topics: true,
  prerequisites: true,
  related: true,
  comparisons: true,
  publishedAt: true,
} as const

/** Every published entry (the fields lists and relations need) and every topic. */
const loadCatalog = cached(
  async () => {
    const client = await payload()
    const [entries, topics] = await Promise.all([
      client.find({
        collection: 'wiki-entries',
        where: { status: { equals: 'published' } },
        sort: '-publishedAt',
        pagination: false,
        locale: 'all',
        depth: 0,
        select: catalogSelect,
        overrideAccess: false,
      }),
      client.find({
        collection: 'wiki-topics',
        sort: 'order',
        pagination: false,
        locale: 'all',
        depth: 0,
        select: { name: true, slug: true, intro: true, mustRead: true, order: true },
        overrideAccess: false,
      }),
    ])
    return { entries: entries.docs as unknown as RawEntry[], topics: topics.docs as unknown as RawTopic[] }
  },
  ['wiki-catalog'],
  cacheOptions,
)

type Catalog = Awaited<ReturnType<typeof loadCatalog>>

function titleOf(entry: Pick<RawEntry, 'title' | 'slug'>, locale: Locale): InLanguage<string> {
  // The title is required in English; the slug only keeps a broken record from crashing the page.
  return inAnyLanguage(entry.title, locale) ?? { value: entry.slug, lang: 'en' }
}

function refOf(entry: RawEntry, locale: Locale): EntryRef {
  return {
    id: entry.id,
    slug: entry.slug,
    type: isEntryType(entry.type) ? entry.type : 'concept',
    title: titleOf(entry, locale),
    definition: inReaderLanguage(entry.definition, locale),
  }
}

function topicRefOf(topic: RawTopic, locale: Locale): TopicRef {
  return { id: topic.id, slug: topic.slug, name: inAnyLanguage(topic.name, locale) ?? { value: topic.slug, lang: 'en' } }
}

/** The 易混 rows a page in this language shows for an entry (the reader's language, else English). */
function comparisonsOf(entry: Pick<RawEntry, 'comparisons'>, locale: Locale): { id: number; difference: InLanguage<string> }[] {
  const rows = inReaderLanguage(entry.comparisons, locale)
  if (!rows) return []
  return rows.value.flatMap((row) => {
    const id = idOf(row.entry)
    return id !== null && row.difference?.trim() ? [{ id, difference: { value: row.difference, lang: rows.lang } }] : []
  })
}

function storedRelations(entry: RawEntry, locale: Locale): StoredRelations {
  return {
    id: entry.id,
    prerequisites: idsOf(entry.prerequisites),
    related: idsOf(entry.related),
    comparisons: comparisonsOf(entry, locale).map((row) => row.id),
  }
}

/** Sorted by the name as the reader sees it, in the reader's alphabet. */
function byTitle(entries: EntryRef[], locale: Locale): EntryRef[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...entries].sort((a, b) => collator.compare(a.title.value, b.title.value))
}

const getCatalog = cache(async () => {
  const catalog = await loadCatalog()
  return { ...catalog, byId: new Map(catalog.entries.map((entry) => [entry.id, entry])) }
})

function entriesOfTopic(catalog: Catalog, topicId: number): RawEntry[] {
  return catalog.entries.filter((entry) => idsOf(entry.topics).includes(topicId))
}

function topicCard(catalog: Catalog & { byId: Map<number, RawEntry> }, topic: RawTopic, locale: Locale, limit?: number): TopicCard {
  const entries = entriesOfTopic(catalog, topic.id)
  const picked = idsOf(topic.mustRead)
    .map((id) => catalog.byId.get(id))
    .filter((entry) => entry !== undefined)
  // Newest first, as the catalog is read, when the editor has not picked any.
  const mustRead = (picked.length > 0 ? picked : limit === undefined ? [] : entries).slice(0, limit)
  return {
    ...topicRefOf(topic, locale),
    intro: inReaderLanguage(topic.intro, locale),
    count: entries.length,
    mustRead: mustRead.map((entry) => refOf(entry, locale)),
  }
}

/** The Wiki home: counts, today's entry, the topics, the newest entries and「你知道吗」. */
export async function getWikiHome(locale: Locale, now: Date = new Date()): Promise<WikiHome> {
  const catalog = await getCatalog()
  const featuredPool = catalog.entries.filter((entry) => entry.featured)
  // Oldest first, so a newly published entry joins the end of the rotation instead of moving every day after it.
  const rotation = [...(featuredPool.length > 0 ? featuredPool : catalog.entries)].reverse()
  const featured = pickOfTheDay(rotation, shanghaiDate(now))
  const facts = catalog.entries
    .map((entry) => ({ entry, fact: inReaderLanguage(entry.fact, locale) }))
    .filter((item) => item.fact !== null)
    .slice(0, factsShown)

  return {
    entries: catalog.entries.length,
    types: {
      concept: catalog.entries.filter((entry) => entry.type !== 'method').length,
      method: catalog.entries.filter((entry) => entry.type === 'method').length,
    },
    topics: catalog.topics
      .map((topic) => topicCard(catalog, topic, locale, mustReadOnCard))
      .filter((topic) => topic.count > 0),
    featured: featured ? refOf(featured, locale) : null,
    newest: catalog.entries.slice(0, newestShown).map((entry) => refOf(entry, locale)),
    facts: facts.map(({ entry, fact }) => ({ fact: fact as InLanguage<string>, entry: refOf(entry, locale) })),
  }
}

/** Every topic with a published entry, for the side column (主题 with counts). */
export async function getTopicsWithEntries(locale: Locale): Promise<(TopicRef & { count: number })[]> {
  const catalog = await getCatalog()
  return catalog.topics
    .map((topic) => ({ ...topicRefOf(topic, locale), count: entriesOfTopic(catalog, topic.id).length }))
    .filter((topic) => topic.count > 0)
}

/** A topic's page: its introduction, the must-read entries in order, then all of them by type; null for an unknown topic. */
export async function getTopic(slug: string, locale: Locale): Promise<TopicDetail | null> {
  const catalog = await getCatalog()
  const topic = catalog.topics.find((item) => item.slug === slug)
  if (!topic) return null
  const entries = entriesOfTopic(catalog, topic.id).map((entry) => refOf(entry, locale))
  return {
    ...topicCard(catalog, topic, locale),
    concepts: byTitle(
      entries.filter((entry) => entry.type === 'concept'),
      locale,
    ),
    methods: byTitle(
      entries.filter((entry) => entry.type === 'method'),
      locale,
    ),
  }
}

/** One page of 全部条目, by name. */
export async function listEntries({ locale, type, page }: { locale: Locale; type: EntryType | null; page: number }): Promise<EntriesPage> {
  const catalog = await getCatalog()
  const topics = new Map(catalog.topics.map((topic) => [topic.id, topic]))
  const all = byTitle(
    catalog.entries.map((entry) => refOf(entry, locale)).filter((entry) => !type || entry.type === type),
    locale,
  )
  const start = (page - 1) * entriesPerPage
  return {
    entries: all.slice(start, start + entriesPerPage).map((entry) => ({
      ...entry,
      topics: idsOf(catalog.byId.get(entry.id)?.topics)
        .map((id) => topics.get(id))
        .filter((topic) => topic !== undefined)
        .map((topic) => topicRefOf(topic, locale)),
    })),
    total: all.length,
    page,
    // Page 1 always exists, so an empty Wiki shows its empty state rather than a 404.
    pages: Math.max(1, Math.ceil(all.length / entriesPerPage)),
  }
}

function searchable(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ')
}

function localizedValues<T>(field: Localized<T>): T[] {
  return field && typeof field === 'object' ? Object.values(field).filter((value): value is T => value !== null && value !== undefined) : []
}

/** Its names in every language: the title, the aliases and the slug (rule 7). */
function namesOf(entry: RawEntry): string[] {
  return [entry.slug, ...localizedValues(entry.title), ...localizedValues(entry.aliases).flat()].filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0,
  )
}

/**
 * The site search's Wiki entries (docs/specs/search.md): names, aliases and definitions in every
 * language; the ones named exactly so first, then those whose name starts with it, then the newest.
 */
export async function searchWiki({
  locale,
  q,
  offset,
  limit,
}: {
  locale: Locale
  q: string
  offset: number
  limit: number
}): Promise<{ entries: EntryRef[]; total: number }> {
  const query = searchable(q.trim())
  const { entries } = await getCatalog()
  const found = query
    ? entries.filter((entry) =>
        // Joined with a character no search contains, so a search never matches across two fields.
        searchable([...namesOf(entry), ...localizedValues(entry.definition)].join('\u0001')).includes(query),
      )
    : []
  const ordered = namesFirst(found, q, namesOf)
  return { entries: ordered.slice(offset, offset + limit).map((entry) => refOf(entry, locale)), total: ordered.length }
}

const detailSelect = {
  ...catalogSelect,
  explanation: true,
  examples: true,
  steps: true,
  uses: true,
  limitations: true,
  contexts: true,
  sources: true,
  reviewedAt: true,
  apps: true,
  skills: true,
  stories: true,
  updatedAt: true,
} as const

const findEntry = cached(
  async (slug: string) => {
    const { docs } = await (await payload()).find({
      collection: 'wiki-entries',
      where: { and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }] },
      limit: 1,
      locale: 'all',
      depth: 0,
      select: detailSelect,
      overrideAccess: false,
    })
    return (docs[0] as unknown as RawEntry | undefined) ?? null
  },
  ['wiki-entry'],
  cacheOptions,
)

/**
 * The apps, Skills and stories an entry recommends, as their own modules show them: only the
 * ones still public, in the editor's order. Cached with their modules' tags too, so one taken
 * down leaves the entry's page when its own module refreshes.
 */
const loadFurther = cached(
  async (apps: number[], skills: number[], stories: number[], locale: Locale) => {
    const [appItems, skillItems, storyItems] = await Promise.all([
      apps.length ? getSavedApps(apps, locale) : [],
      skills.length ? getSavedSkills(skills, locale) : [],
      stories.length ? getSavedStories(stories, locale) : [],
    ])
    return {
      apps: appItems.map((app): FurtherApp => ({ slug: app.slug, name: app.name, tagline: app.tagline, logo: app.logo })),
      skills: skillItems.map((skill): FurtherSkill => ({ slug: skill.slug, name: skill.name, tagline: skill.tagline })),
      stories: storyItems.map((story): FurtherStory => ({ slug: story.slug, title: story.title, publishedAt: story.publishedAt })),
    }
  },
  ['wiki-further'],
  { tags: [wikiCacheTag, appsCacheTag, skillsCacheTag, DAILY_CACHE_TAG], revalidate: 3600 },
)

function rowsOf<T>(field: Localized<T[]>, locale: Locale): InLanguage<T[]> | null {
  return inReaderLanguage(field, locale)
}

/** A published entry with everything its page shows; null when there is none by that slug. */
export const getEntry = cache(async (slug: string, locale: Locale): Promise<EntryDetail | null> => {
  const [doc, catalog] = await Promise.all([findEntry(slug), getCatalog()])
  if (!doc) return null

  const shown = (id: number) => catalog.byId.has(id)
  const ref = (id: number) => refOf(catalog.byId.get(id) as RawEntry, locale)
  const own = storedRelations(doc, locale)
  const gathered = gatherRelations(
    own,
    catalog.entries.filter((entry) => entry.id !== doc.id).map((entry) => storedRelations(entry, locale)),
    shown,
  )
  const ownDifferences = new Map(comparisonsOf(doc, locale).map((row) => [row.id, row.difference]))
  const topics = new Map(catalog.topics.map((topic) => [topic.id, topic]))
  const title = titleOf(doc, locale)
  const further = await loadFurther(idsOf(doc.apps), idsOf(doc.skills), idsOf(doc.stories), locale)

  return {
    ...refOf(doc, locale),
    otherNames: otherNames(title, typeof doc.title?.en === 'string' ? doc.title.en : '', rowsOf(doc.aliases, locale)),
    explanation: inReaderLanguage(doc.explanation, locale),
    examples: rowsOf(doc.examples, locale),
    steps: doc.type === 'method' ? rowsOf(doc.steps, locale) : null,
    uses: inReaderLanguage(doc.uses, locale),
    limitations: inReaderLanguage(doc.limitations, locale),
    contexts: rowsOf(doc.contexts, locale),
    topics: idsOf(doc.topics)
      .map((id) => topics.get(id))
      .filter((topic) => topic !== undefined)
      .map((topic) => topicRefOf(topic, locale)),
    prerequisites: gathered.prerequisites.map(ref),
    next: gathered.next.map(ref),
    related: gathered.related.map(ref),
    comparisons: gathered.comparisons.flatMap(({ id, from }) => {
      const difference =
        from === 'own' ? ownDifferences.get(id) : comparisonsOf(catalog.byId.get(id) as RawEntry, locale).find((row) => row.id === doc.id)?.difference
      return difference ? [{ entry: ref(id), difference }] : []
    }),
    sources: (doc.sources ?? []).map((source) => ({ title: source.title, url: source.url, publisher: source.publisher?.trim() || null })),
    reviewedAt: doc.reviewedAt ?? null,
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt,
    ...further,
  }
})

/** Published entries' addresses and dates, for the sitemap. */
export const findEntriesForSitemap = cached(
  async () => {
    const { docs } = await (await payload()).find({
      collection: 'wiki-entries',
      where: { status: { equals: 'published' } },
      sort: '-updatedAt',
      pagination: false,
      depth: 0,
      select: { slug: true, updatedAt: true },
      overrideAccess: false,
    })
    return docs.map((entry) => ({ slug: entry.slug, updatedAt: entry.updatedAt }))
  },
  ['wiki-sitemap'],
  cacheOptions,
)
