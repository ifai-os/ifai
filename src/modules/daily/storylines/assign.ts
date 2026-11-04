import { eq, sql } from '@payloadcms/db-postgres/drizzle'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import { EMBEDDING_DIMENSIONS } from '@/lib/ai/purposes'
import { getDb } from '@/lib/db/drizzle'

import { storylinePrompt, type StorylineOption, type StorylineStory } from '../prompts'
import { refreshDailyCache } from '../review/cache'
import { rawItems } from '../schema'
import {
  candidateMinSimilarity,
  partnerCandidates,
  readDecision,
  storylineCandidates,
  storylineSince,
  storylineSlug,
  type StorylineDecision,
} from './rules'

type Payload = Awaited<ReturnType<typeof getDb>>['payload']
type Db = Awaited<ReturnType<typeof getDb>>['db']

/** Latest stories of a storyline shown to the model, so it sees where the storyline is now. */
const storiesPerOption = 3

const writtenLocales = ['zh-Hans', 'ja', 'ko'] as const

export type AssignOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'done'; decision: StorylineDecision['kind']; storylineId: number | null; stories: number[] }

type LoadedStory = {
  id: number
  status: string
  eventId: number
  representativeItemId: number
  storyline: number | null
  storylineByEditor: boolean
  title: string
  summary: string | null
  publishedAt: string | null
  entities: string[]
}

const idOf = (value: unknown): number | null =>
  value && typeof value === 'object' ? ((value as { id?: number }).id ?? null) : typeof value === 'number' ? value : null

function toLoaded(doc: Record<string, unknown>): LoadedStory {
  return {
    id: doc.id as number,
    status: doc.status as string,
    eventId: doc.eventId as number,
    representativeItemId: doc.representativeItemId as number,
    storyline: idOf(doc.storyline),
    storylineByEditor: Boolean(doc.storylineByEditor),
    title: (doc.title as string) ?? '',
    summary: (doc.summary as string | null) ?? null,
    publishedAt: (doc.publishedAt as string | null) ?? null,
    entities: ((doc.entities as { name?: string }[] | null) ?? []).flatMap((entity) => (entity.name ? [entity.name] : [])),
  }
}

const storySelect = {
  status: true,
  eventId: true,
  representativeItemId: true,
  storyline: true,
  storylineByEditor: true,
  title: true,
  summary: true,
  publishedAt: true,
  entities: true,
} as const

async function loadStories(payload: Payload, ids: readonly number[]): Promise<LoadedStory[]> {
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection: 'stories',
    where: { id: { in: [...ids] } },
    locale: 'en',
    depth: 0,
    pagination: false,
    select: storySelect,
  })
  const byId = new Map(docs.map((doc) => [doc.id, toLoaded(doc as unknown as Record<string, unknown>)]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

const asPrompt = (story: LoadedStory): StorylineStory => ({
  id: story.id,
  title: story.title,
  summary: story.summary,
  publishedAt: story.publishedAt,
  entities: story.entities,
})

/**
 * The report's vector, made now when it has none: stories from the editors' pipeline are never
 * judged here, so their reports start without one (it also lets「同类事件」find them).
 */
async function ensureEmbedding(db: Db, itemId: number, ai: Ai): Promise<boolean> {
  const [item] = await db
    .select({ title: rawItems.title, summary: rawItems.summary, missing: sql<boolean>`${rawItems.embedding} is null` })
    .from(rawItems)
    .where(eq(rawItems.id, itemId))
    .limit(1)
  if (!item) return false
  if (!item.missing) return true
  const { output } = await ai.embed({
    purpose: 'embed',
    subject: `raw_items:${itemId}`,
    values: [[item.title, item.summary ?? ''].filter(Boolean).join('\n')],
  })
  const embedding = output[0]
  if (embedding?.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding has ${embedding?.length ?? 0} dimensions, the column has ${EMBEDDING_DIMENSIONS}`)
  }
  await db.update(rawItems).set({ embedding }).where(eq(rawItems.id, itemId))
  return true
}

/** Ongoing storylines with a story published in the window, by their most similar story. */
async function similarStorylines(db: Db, story: LoadedStory, since: Date): Promise<number[]> {
  const similarity = sql`1 - (theirs.embedding <=> mine.embedding)`
  const rows = await db.execute<{ id: number }>(sql`
    select s.storyline_id as id from stories s
    join storylines l on l.id = s.storyline_id
    join raw_items theirs on theirs.id = s.representative_item_id
    join raw_items mine on mine.id = ${story.representativeItemId}
    where s.status = 'published' and l.status = 'active' and s.id <> ${story.id}
      and s.published_at >= ${since.toISOString()} and theirs.embedding is not null
    group by s.storyline_id
    having max(${similarity}) >= ${candidateMinSimilarity}
    order by max(${similarity}) desc
    limit ${storylineCandidates}`)
  return rows.rows.map((row) => Number(row.id))
}

/** Earlier published stories of other events without a storyline (and not taken off one by the editor). */
async function similarLoose(db: Db, story: LoadedStory, since: Date): Promise<number[]> {
  const distance = sql`theirs.embedding <=> mine.embedding`
  const rows = await db.execute<{ id: number }>(sql`
    select id from (
      select distinct on (s.event_id) s.id, ${distance} as distance from stories s
      join raw_items theirs on theirs.id = s.representative_item_id
      join raw_items mine on mine.id = ${story.representativeItemId}
      where s.status = 'published' and s.storyline_id is null and coalesce(s.storyline_by_editor, false) = false
        and s.id <> ${story.id} and s.event_id <> ${story.eventId}
        and s.published_at >= ${since.toISOString()} and theirs.embedding is not null
        and 1 - (${distance}) >= ${candidateMinSimilarity}
      order by s.event_id, ${distance}
    ) closest
    order by distance
    limit ${partnerCandidates}`)
  return rows.rows.map((row) => Number(row.id))
}

async function storylineOptions(payload: Payload, ids: readonly number[]): Promise<StorylineOption[]> {
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection: 'storylines',
    where: { id: { in: [...ids] } },
    locale: 'en',
    depth: 0,
    pagination: false,
  })
  const options = await Promise.all(
    docs.map(async (doc): Promise<StorylineOption> => {
      const latest = await payload.find({
        collection: 'stories',
        where: { and: [{ storyline: { equals: doc.id } }, { status: { equals: 'published' } }] },
        sort: '-publishedAt',
        limit: storiesPerOption,
        locale: 'en',
        depth: 0,
        select: storySelect,
      })
      return {
        id: doc.id,
        name: doc.name,
        summary: doc.summary ?? null,
        stories: latest.docs.map((other) => asPrompt(toLoaded(other as unknown as Record<string, unknown>))),
      }
    }),
  )
  const byId = new Map(options.map((option) => [option.id, option]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

async function freeSlug(payload: Payload, base: string): Promise<string> {
  for (let n = 1; n < 20; n++) {
    const slug = n === 1 ? base : `${base}-${n}`
    const { totalDocs } = await payload.count({ collection: 'storylines', where: { slug: { equals: slug } } })
    if (totalDocs === 0) return slug
  }
  return `${base}-${Date.now()}`
}

async function createStoryline(payload: Payload, decision: Extract<StorylineDecision, { kind: 'new' }>, storyId: number): Promise<number> {
  const created = await payload.create({
    collection: 'storylines',
    locale: 'en',
    data: {
      name: decision.name.en,
      summary: decision.summary.en || null,
      slug: await freeSlug(payload, storylineSlug(decision.name.en, storyId)),
      status: 'active',
    },
    depth: 0,
  })
  // The zh-Hans save also writes zh-Hant, converted with OpenCC (AGENTS.md rule 4).
  for (const locale of writtenLocales) {
    await payload.update({
      collection: 'storylines',
      id: created.id,
      locale,
      data: { name: decision.name[locale], summary: decision.summary[locale] || null },
      depth: 0,
    })
  }
  return created.id
}

async function setStoryline(payload: Payload, ids: readonly number[], storylineId: number): Promise<void> {
  for (const id of ids) {
    await payload.update({ collection: 'stories', id, data: { storyline: storylineId }, depth: 0 })
  }
}

/**
 * Put one published story on its storyline (docs/specs/daily.md「持续事件」): make sure its
 * report has a vector, offer the model the similar ongoing storylines and the similar earlier
 * stories without one, and do what it answers. A story the editor placed, or one already on a
 * storyline, is left alone; with nothing similar enough, the model is not asked at all.
 */
export async function assignStoryline(storyId: number, deps: { ai?: Ai; now?: Date; refresh?: boolean } = {}): Promise<AssignOutcome> {
  const ai = deps.ai ?? defaultAi
  const { payload, db } = await getDb()
  const [story] = await loadStories(payload, [storyId])
  if (!story) return { status: 'skipped', reason: 'no such story' }
  if (story.status !== 'published') return { status: 'skipped', reason: `story is ${story.status}` }
  if (story.storylineByEditor) return { status: 'skipped', reason: 'set by the editor' }
  if (story.storyline) return { status: 'skipped', reason: 'already on a storyline' }
  if (!(await ensureEmbedding(db, story.representativeItemId, ai))) return { status: 'skipped', reason: 'report missing' }

  const since = storylineSince(deps.now ?? new Date())
  const [storylineIds, looseIds] = await Promise.all([similarStorylines(db, story, since), similarLoose(db, story, since)])
  if (!storylineIds.length && !looseIds.length) return { status: 'done', decision: 'none', storylineId: null, stories: [] }

  const [options, partners] = await Promise.all([storylineOptions(payload, storylineIds), loadStories(payload, looseIds)])
  const { output } = await ai.object({
    purpose: 'storyline',
    subject: `stories:${storyId}`,
    instructions: storylinePrompt.instructions,
    prompt: storylinePrompt.build(asPrompt(story), options, partners.map(asPrompt)),
    schema: storylinePrompt.schema,
    temperature: 0,
  })
  const decision = readDecision(output, { storylines: options.map((option) => option.id), partners: partners.map((other) => other.id) })

  let storylineId: number | null = null
  let stories: number[] = []
  if (decision.kind === 'join') {
    storylineId = decision.storylineId
    stories = [storyId]
  } else if (decision.kind === 'new') {
    storylineId = await createStoryline(payload, decision, storyId)
    stories = [storyId, ...decision.partnerIds]
  }
  if (storylineId) {
    await setStoryline(payload, stories, storylineId)
    if (deps.refresh !== false) await refreshDailyCache()
  }
  return { status: 'done', decision: decision.kind, storylineId, stories }
}

/** Most stories one backfill goes over (Inngest allows 1,000 steps a run). */
export const backfillLimit = 900

/** Published stories of the window without a storyline that the editor did not place, oldest first. */
export async function unassignedStories(now: Date): Promise<number[]> {
  const { payload } = await getDb()
  const { docs } = await payload.find({
    collection: 'stories',
    where: {
      and: [
        { status: { equals: 'published' } },
        { storyline: { exists: false } },
        { storylineByEditor: { not_equals: true } },
        { publishedAt: { greater_than_equal: storylineSince(now).toISOString() } },
      ],
    },
    sort: 'publishedAt',
    limit: backfillLimit,
    depth: 0,
    select: { publishedAt: true },
  })
  return docs.map((doc) => doc.id)
}
