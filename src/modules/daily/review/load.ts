/** Loading helpers shared by the queue, the detail and the actions. */
import { and, desc, eq, gt, inArray, isNotNull, sql } from '@payloadcms/db-postgres/drizzle'
import { alias } from '@payloadcms/db-postgres/drizzle/pg-core'

import { getDb } from '@/lib/db/drizzle'
import type { Story } from '@/payload-types'

import type { StoryStatus } from '../story-fields'
import { GROUP_WINDOW_DAYS, SIMILARITY_MIN, type AnalysisFlag } from '../judge/rules'
import { itemAnalyses, rawItems } from '../schema'
import { asVerification, localeStates, rewrittenLocales, stillMissing, type LocaleStatus, type RewrittenLocale } from './rules'
import type { DuplicateCandidate, LocaleText, StorySourceInput } from './types'

export type Db = Awaited<ReturnType<typeof getDb>>['db']
export type Payload = Awaited<ReturnType<typeof getDb>>['payload']

/** A story read with `locale: 'all'`: the localized fields are objects keyed by locale. */
export type StoryAll = Omit<Story, 'title' | 'summary' | 'tryIt'> & {
  title: Partial<Record<string, string>>
  summary: Partial<Record<string, string>>
  tryIt?: Partial<Record<string, string | null>> | null
}

export async function loadStoryAll(payload: Payload, id: number): Promise<StoryAll | null> {
  try {
    return (await payload.findByID({ collection: 'stories', id, locale: 'all', depth: 0 })) as unknown as StoryAll
  } catch {
    return null
  }
}

export async function findStoriesAll(payload: Payload, where: Parameters<Payload['find']>[0]['where'], limit = 500): Promise<StoryAll[]> {
  const { docs } = await payload.find({ collection: 'stories', where, locale: 'all', depth: 0, pagination: false, limit })
  return docs as unknown as StoryAll[]
}

export function textOf(story: StoryAll, locale: string): LocaleText | null {
  const title = story.title?.[locale]
  if (!title) return null
  return { title, summary: story.summary?.[locale] ?? '', tryIt: story.tryIt?.[locale] ?? '' }
}

/** The simplified Chinese text, falling back to English for a story that somehow lacks it. */
export function hansOf(story: StoryAll): LocaleText {
  return textOf(story, 'zh-Hans') ?? textOf(story, 'en') ?? { title: '', summary: '', tryIt: '' }
}

export function sourcesOf(story: StoryAll): StorySourceInput[] {
  return (story.sources ?? []).map((source) => ({ name: source.name, role: source.role, url: source.url, publishedAt: source.publishedAt ?? null }))
}

export function flagsOf(story: StoryAll): AnalysisFlag[] {
  return Array.isArray(story.flags) ? (story.flags.filter((flag) => typeof flag === 'string') as AnalysisFlag[]) : []
}

export function localeStatusOf(story: StoryAll): LocaleStatus {
  return story.localeStatus && typeof story.localeStatus === 'object' && !Array.isArray(story.localeStatus)
    ? (story.localeStatus as LocaleStatus)
    : {}
}

/** Other reports of the same happening, as the source list names them. */
export function moreReportsOf(story: StoryAll): number {
  return (story.sources ?? []).filter((source) => source.role === 'report').length
}

/** Per-locale "title + summary + try-it" of the stored texts, for the source check. */
export function allTexts(story: StoryAll, hansOverride?: LocaleText): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const locale of ['zh-Hans', ...rewrittenLocales]) {
    const text = locale === 'zh-Hans' && hansOverride ? hansOverride : textOf(story, locale)
    if (text) texts[locale] = [text.title, text.summary, text.tryIt].join('\n')
  }
  return texts
}

export function unverifiedCount(story: StoryAll): number {
  return stillMissing(asVerification(story.verification), allTexts(story)).length
}

export function failedLocalesOf(story: StoryAll, hash: string): RewrittenLocale[] {
  const states = localeStates(localeStatusOf(story), hash)
  return rewrittenLocales.filter((locale) => states[locale] === 'failed')
}

export async function analysesFor(db: Db, itemIds: number[]): Promise<Map<number, { scoreA: number | null; scoreB: number | null }>> {
  if (!itemIds.length) return new Map()
  const rows = await db
    .select({ itemId: itemAnalyses.itemId, scoreA: itemAnalyses.scoreA, scoreB: itemAnalyses.scoreB })
    .from(itemAnalyses)
    .where(inArray(itemAnalyses.itemId, itemIds))
  return new Map(rows.map((row) => [row.itemId, { scoreA: row.scoreA, scoreB: row.scoreB }]))
}

type Candidate = { id: number; eventId: number; representativeItemId: number; keptApartFrom?: number | null }

/**
 * For each story awaiting review, the published story it may duplicate: one of the same event
 * (the grouping step called it a follow-up), or else the most similar published report of the
 * last two weeks (pgvector, same threshold as grouping). The editor merges or keeps it apart;
 * a pair the editor kept apart (either way round) is not suggested again.
 */
export async function findDuplicates(
  db: Db,
  payload: Payload,
  candidates: Candidate[],
  now: Date,
  publishedStatuses: StoryStatus[] = ['published'],
): Promise<Map<number, DuplicateCandidate>> {
  const result = new Map<number, DuplicateCandidate>()
  if (!candidates.length) return result
  const since = new Date(now.getTime() - GROUP_WINDOW_DAYS * 86_400_000).toISOString()
  const { docs: published } = await payload.find({
    collection: 'stories',
    where: { and: [{ status: { in: publishedStatuses } }, { publishedAt: { greater_than: since } }] },
    locale: 'zh-Hans',
    depth: 0,
    pagination: false,
    limit: 500,
  })
  if (!published.length) return result
  const toCandidate = (story: Story, similarity: number | null, reason: DuplicateCandidate['reason']): DuplicateCandidate => ({
    id: story.id,
    title: story.title,
    publishedAt: story.publishedAt ?? null,
    similarity,
    reason,
  })

  const keptApart = (candidate: Candidate, story: Story) =>
    story.id === candidate.id || candidate.keptApartFrom === story.id || story.keptApartFrom === candidate.id
  const byItem = new Map<number, Story>()
  for (const story of published) byItem.set(story.representativeItemId, story)
  const unmatched: Candidate[] = []
  for (const candidate of candidates) {
    const same = published.find((story) => story.eventId === candidate.eventId && !keptApart(candidate, story))
    if (same) result.set(candidate.id, toCandidate(same, null, 'same_event'))
    else unmatched.push(candidate)
  }
  if (!unmatched.length) return result

  const mine = alias(rawItems, 'mine')
  const theirs = alias(rawItems, 'theirs')
  // pgvector's cosine distance between two columns (drizzle's helper only takes a column and a value).
  const similarity = sql<number>`1 - (${mine.embedding} <=> ${theirs.embedding})`
  const rows = await db
    .select({ itemId: mine.id, otherItemId: theirs.id, similarity })
    .from(mine)
    .innerJoin(theirs, and(inArray(theirs.id, [...byItem.keys()]), isNotNull(theirs.embedding), gt(similarity, SIMILARITY_MIN)))
    .where(and(inArray(mine.id, unmatched.map((c) => c.representativeItemId)), isNotNull(mine.embedding)))
    .orderBy(desc(similarity))
  for (const candidate of unmatched) {
    const best = rows.find((row) => {
      if (row.itemId !== candidate.representativeItemId) return false
      const story = byItem.get(row.otherItemId)
      return Boolean(story) && !keptApart(candidate, story!)
    })
    const story = best && byItem.get(best.otherItemId)
    if (story) result.set(candidate.id, toCandidate(story, Number(best.similarity), 'similar'))
  }
  return result
}

/** The report count of an event's representative in `item_analyses`, by raw item id. */
export async function representativeOf(db: Db, itemId: number) {
  const [row] = await db.select().from(itemAnalyses).where(eq(itemAnalyses.itemId, itemId)).limit(1)
  return row ?? null
}
