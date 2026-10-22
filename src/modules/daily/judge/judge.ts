import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from '@payloadcms/db-postgres/drizzle'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import { EMBEDDING_DIMENSIONS } from '@/lib/ai/purposes'
import { getDb } from '@/lib/db/drizzle'
import type { Source } from '@/payload-types'

import { groupPrompt, prefilterPrompt, scorePrompt, structurePrompt, type GroupReport, type Material } from '../prompts'
import { excerpt } from '../prompts/version'
import {
  analysisStages,
  eventItems,
  events,
  itemAnalyses,
  rawItems,
  type AnalysisOutcome,
  type AnalysisStage,
} from '../schema'
import {
  GROUP_CANDIDATES,
  GROUP_WINDOW_DAYS,
  SCORE_GAP_FLAG,
  SIMILARITY_MIN,
  scoreVerdict,
  thresholdFor,
  type AnalysisFlag,
} from './rules'

export type JudgeDeps = {
  ai?: Ai
  now?: () => Date
  env?: Record<string, string | undefined>
}

/** What one judging step reports back to the job. */
export type StepResult =
  | { status: 'done'; stage: AnalysisStage; outcome: AnalysisOutcome; note?: string }
  /** The item is not for judging (archived, body not fetched yet, gone). */
  | { status: 'stopped'; reason: string }

type Db = Awaited<ReturnType<typeof getDb>>['db']
type RawItem = typeof rawItems.$inferSelect
type Analysis = typeof itemAnalyses.$inferSelect
type AnalysisPatch = Partial<typeof itemAnalyses.$inferInsert>

type Loaded = { db: Db; payload: Awaited<ReturnType<typeof getDb>>['payload']; item: RawItem; source: Source; analysis: Analysis }

const SCORE_TEMPERATURE = 0.4

async function load(itemId: number): Promise<Loaded | null> {
  const { payload, db } = await getDb()
  const [item] = await db.select().from(rawItems).where(eq(rawItems.id, itemId)).limit(1)
  if (!item) return null
  await db.insert(itemAnalyses).values({ itemId }).onConflictDoNothing({ target: itemAnalyses.itemId })
  const [analysis] = await db.select().from(itemAnalyses).where(eq(itemAnalyses.itemId, itemId)).limit(1)
  const source = await payload.findByID({ collection: 'sources', id: item.sourceId })
  return { db, payload, item, source, analysis }
}

async function patch(db: Db, itemId: number, values: AnalysisPatch): Promise<void> {
  await db
    .update(itemAnalyses)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(itemAnalyses.itemId, itemId))
}

const stageIndex = (stage: AnalysisStage) => analysisStages.indexOf(stage)

/** Null when the step should run; otherwise what to report instead. */
function skip({ item, analysis }: Loaded, stage: AnalysisStage): StepResult | null {
  if (item.status !== 'fresh') return { status: 'stopped', reason: `item is ${item.status}` }
  if (item.contentStatus === 'pending') return { status: 'stopped', reason: 'article body not fetched yet' }
  if (analysis.outcome !== 'pending') return { status: 'done', stage: analysis.stage, outcome: analysis.outcome, note: 'decided earlier' }
  if (stageIndex(analysis.stage) >= stageIndex(stage)) {
    return { status: 'done', stage: analysis.stage, outcome: analysis.outcome, note: 'stage done earlier' }
  }
  return null
}

function materialOf(item: RawItem, source: Source): Material {
  return {
    url: item.url,
    title: item.title,
    summary: item.summary,
    content: item.content,
    publishedAt: item.publishedAt,
    source: { name: source.name, tier: source.tier, use: source.use },
    discussion: item.discussionUrl
      ? { url: item.discussionUrl, points: item.signals?.points, comments: item.signals?.comments }
      : null,
  }
}

const subjectOf = (itemId: number) => `raw_items:${itemId}`

const withFlags = (analysis: Analysis, add: AnalysisFlag[]): AnalysisFlag[] => [...new Set([...(analysis.flags ?? []), ...add])]

/** 1. Is it about AI at all? Roundup sources skip judging: they only point at events. */
export async function prefilterStep(itemId: number, deps: JudgeDeps = {}): Promise<StepResult> {
  const loaded = await load(itemId)
  if (!loaded) return { status: 'stopped', reason: 'item missing' }
  const skipped = skip(loaded, 'prefiltered')
  if (skipped) return skipped
  const { db, item, source, analysis } = loaded
  const ai = deps.ai ?? defaultAi

  if (source.use === 'roundup') {
    const linked = await attachRoundup(db, item)
    await patch(db, itemId, { stage: 'grouped', outcome: 'roundup', outcomeReason: `Roundup source; linked to ${linked} events` })
    return { status: 'done', stage: 'grouped', outcome: 'roundup' }
  }

  const { output } = await ai.object({
    purpose: 'prefilter',
    subject: subjectOf(itemId),
    instructions: prefilterPrompt.instructions,
    prompt: prefilterPrompt.build(materialOf(item, source)),
    schema: prefilterPrompt.schema,
    temperature: 0,
  })
  const outcome: AnalysisOutcome = output.relevant ? 'pending' : 'irrelevant'
  await patch(db, itemId, {
    stage: 'prefiltered',
    relevant: output.relevant,
    relevanceReason: output.reason,
    outcome,
    outcomeReason: output.relevant ? null : output.reason,
    promptVersions: { ...analysis.promptVersions, prefilter: prefilterPrompt.version },
  })
  return { status: 'done', stage: 'prefiltered', outcome }
}

/** 2. Two independent scores; the average must clear the source tier's threshold. */
export async function scoreStep(itemId: number, deps: JudgeDeps = {}): Promise<StepResult> {
  const loaded = await load(itemId)
  if (!loaded) return { status: 'stopped', reason: 'item missing' }
  const skipped = skip(loaded, 'scored')
  if (skipped) return skipped
  const { db, item, source, analysis } = loaded
  const ai = deps.ai ?? defaultAi

  const prompt = scorePrompt.build(materialOf(item, source))
  const score = (variant: 'a' | 'b') =>
    ai.object({
      purpose: 'score',
      variant,
      subject: subjectOf(itemId),
      instructions: scorePrompt.instructions,
      prompt,
      schema: scorePrompt.schema,
      temperature: SCORE_TEMPERATURE,
    })
  const a = (await score('a')).output
  const b = (await score('b')).output
  const threshold = thresholdFor(source.tier, deps.env)
  const verdict = scoreVerdict(a.score, b.score, threshold)
  const outcome: AnalysisOutcome = verdict.passed ? 'pending' : 'low_score'
  await patch(db, itemId, {
    stage: 'scored',
    scoreA: a.score,
    scoreB: b.score,
    scoreAverage: verdict.average,
    scoreThreshold: threshold,
    scoreReasons: [a.reason, b.reason],
    flags: withFlags(analysis, verdict.gap >= SCORE_GAP_FLAG ? ['score_gap'] : []),
    outcome,
    outcomeReason: verdict.passed ? null : `Average ${verdict.average} below the ${source.tier} threshold ${threshold}`,
    promptVersions: { ...analysis.promptVersions, score: scorePrompt.version },
  })
  return { status: 'done', stage: 'scored', outcome }
}

/** 3. Category, companies, products, facts; and whether this is news, a digest, or too thin. */
export async function structureStep(itemId: number, deps: JudgeDeps = {}): Promise<StepResult> {
  const loaded = await load(itemId)
  if (!loaded) return { status: 'stopped', reason: 'item missing' }
  const skipped = skip(loaded, 'structured')
  if (skipped) return skipped
  const { db, item, source, analysis } = loaded
  const ai = deps.ai ?? defaultAi

  const { output } = await ai.object({
    purpose: 'structure',
    subject: subjectOf(itemId),
    instructions: structurePrompt.instructions,
    prompt: structurePrompt.build(materialOf(item, source)),
    schema: structurePrompt.schema,
    temperature: 0,
  })
  const flags: AnalysisFlag[] = []
  if (output.flags.promotional) flags.push('promotional')
  if (output.flags.tutorial) flags.push('tutorial')

  let outcome: AnalysisOutcome = 'pending'
  let outcomeReason: string | null = null
  let stage: AnalysisStage = 'structured'
  if (output.kind === 'insufficient') {
    outcome = 'insufficient'
    outcomeReason = 'Not enough material to know what happened'
  } else if (output.kind === 'roundup') {
    const linked = await attachRoundup(db, item)
    outcome = 'roundup'
    outcomeReason = `Digest; linked to ${linked} events`
    stage = 'grouped'
  }
  await patch(db, itemId, {
    stage,
    structure: output,
    flags: withFlags(analysis, flags),
    outcome,
    outcomeReason,
    promptVersions: { ...analysis.promptVersions, structure: structurePrompt.version },
  })
  return { status: 'done', stage, outcome }
}

/** Text that stands for the report in similarity search: title, summary and the extracted facts. */
export function embeddingText(item: Pick<RawItem, 'title' | 'summary' | 'content'>, analysis: Pick<Analysis, 'structure'>): string {
  const facts = analysis.structure?.facts?.map((fact) => `${fact.who}: ${fact.what}`).join('\n') ?? ''
  return [item.title, item.summary ?? '', facts || excerpt(item.content, 800)].filter(Boolean).join('\n')
}

/** 4. A vector for the report, stored on raw_items. */
export async function embedStep(itemId: number, deps: JudgeDeps = {}): Promise<StepResult> {
  const loaded = await load(itemId)
  if (!loaded) return { status: 'stopped', reason: 'item missing' }
  const skipped = skip(loaded, 'embedded')
  if (skipped) return skipped
  const { db, item, analysis } = loaded
  const ai = deps.ai ?? defaultAi

  const { output } = await ai.embed({ purpose: 'embed', subject: subjectOf(itemId), values: [embeddingText(item, analysis)] })
  const embedding = output[0]
  if (embedding?.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding has ${embedding?.length ?? 0} dimensions, the column has ${EMBEDDING_DIMENSIONS}`)
  }
  await db.update(rawItems).set({ embedding }).where(eq(rawItems.id, itemId))
  await patch(db, itemId, { stage: 'embedded' })
  return { status: 'done', stage: 'embedded', outcome: 'pending' }
}

/** 5. Find similar recent reports; the model says same / follow-up / unrelated; join or start an event. */
export async function groupStep(itemId: number, deps: JudgeDeps = {}): Promise<StepResult> {
  const loaded = await load(itemId)
  if (!loaded) return { status: 'stopped', reason: 'item missing' }
  const skipped = skip(loaded, 'grouped')
  if (skipped) return skipped
  const { db, payload, item, source, analysis } = loaded
  const ai = deps.ai ?? defaultAi
  const now = deps.now?.() ?? new Date()
  if (!item.embedding) throw new Error('groupStep before embedStep')
  if (!analysis.structure) throw new Error('groupStep before structureStep')

  const since = new Date(now.getTime() - GROUP_WINDOW_DAYS * 86_400_000)
  const similarity = sql<number>`1 - (${cosineDistance(rawItems.embedding, item.embedding)})`
  const candidates = await db
    .select({
      id: rawItems.id,
      title: rawItems.title,
      summary: rawItems.summary,
      publishedAt: rawItems.publishedAt,
      sourceId: rawItems.sourceId,
      eventId: eventItems.eventId,
      structure: itemAnalyses.structure,
      similarity,
    })
    .from(rawItems)
    .innerJoin(eventItems, and(eq(eventItems.itemId, rawItems.id), ne(eventItems.relation, 'roundup')))
    .leftJoin(itemAnalyses, eq(itemAnalyses.itemId, rawItems.id))
    .where(
      and(
        ne(rawItems.id, itemId),
        gte(rawItems.discoveredAt, since),
        isNotNull(rawItems.embedding),
        gt(similarity, SIMILARITY_MIN),
      ),
    )
    .orderBy(desc(similarity))
    .limit(GROUP_CANDIDATES)

  let decision: { eventId: number; relation: 'same' | 'follow_up'; newInformation: boolean; reason: string } | null = null
  if (candidates.length) {
    const sourceNames = await namesOf(payload, [...new Set(candidates.map((c) => c.sourceId))])
    const report: GroupReport = {
      id: itemId,
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt,
      sourceName: source.name,
      facts: analysis.structure.facts,
    }
    const earlier: GroupReport[] = candidates.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      publishedAt: c.publishedAt,
      sourceName: sourceNames.get(c.sourceId) ?? `source ${c.sourceId}`,
      facts: c.structure?.facts,
    }))
    const { output } = await ai.object({
      purpose: 'group',
      subject: subjectOf(itemId),
      instructions: groupPrompt.instructions,
      prompt: groupPrompt.build(report, earlier),
      schema: groupPrompt.schema,
      temperature: 0,
    })
    const byId = new Map(output.relations.map((relation) => [relation.id, relation]))
    // Candidates come most similar first; the first "same" wins, else the first follow-up.
    const same = candidates.find((c) => byId.get(c.id)?.relation === 'same')
    const followUp = candidates.find((c) => byId.get(c.id)?.relation === 'follow_up')
    const picked = same ?? followUp
    if (picked) {
      const relation = byId.get(picked.id)!
      decision = {
        eventId: picked.eventId,
        relation: same ? 'same' : 'follow_up',
        newInformation: same ? relation.newInformation : true,
        reason: relation.reason,
      }
    }
  }

  const seenAt = item.publishedAt ?? item.discoveredAt
  let eventId: number
  let relation: 'same' | 'follow_up'
  let outcome: AnalysisOutcome
  let outcomeReason: string
  if (decision) {
    eventId = decision.eventId
    relation = decision.relation
    await db
      .insert(eventItems)
      .values({ eventId, itemId, relation, newInformation: decision.newInformation })
      .onConflictDoNothing()
    await db
      .update(events)
      .set({ lastSeenAt: sql`greatest(${events.lastSeenAt}, ${seenAt})`, updatedAt: now })
      .where(eq(events.id, eventId))
    outcome = relation === 'same' ? 'merged' : 'queued'
    outcomeReason =
      relation === 'same'
        ? `Same happening as report ${candidates.find((c) => c.eventId === eventId)?.id}: ${decision.reason}`
        : `Follow-up of event ${eventId}: ${decision.reason}`
  } else {
    const [created] = await db
      .insert(events)
      .values({
        representativeItemId: itemId,
        title: item.title,
        category: analysis.structure.category,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      })
      .returning({ id: events.id })
    eventId = created.id
    relation = 'same'
    await db.insert(eventItems).values({ eventId, itemId, relation, newInformation: true })
    outcome = 'queued'
    outcomeReason = candidates.length ? 'Unrelated to the similar reports; new event' : 'No similar report in the last 14 days; new event'
  }

  await patch(db, itemId, {
    stage: 'grouped',
    eventId,
    relation,
    outcome,
    outcomeReason,
    promptVersions: { ...analysis.promptVersions, ...(candidates.length && { group: groupPrompt.version }) },
  })
  return { status: 'done', stage: 'grouped', outcome }
}

export const judgeSteps = [
  ['prefilter', prefilterStep],
  ['score', scoreStep],
  ['structure', structureStep],
  ['embed', embedStep],
  ['group', groupStep],
] as const

/** All five steps in a row, for scripts and tests; the Inngest job runs them as separate steps. */
export async function judgeItem(itemId: number, deps: JudgeDeps = {}): Promise<StepResult> {
  let last: StepResult = { status: 'stopped', reason: 'no steps' }
  for (const [, run] of judgeSteps) {
    last = await run(itemId, deps)
    if (last.status !== 'done' || last.outcome !== 'pending') return last
  }
  return last
}

/** Mark an item whose model call failed repeatedly; a person has to look. */
export async function markBlocked(itemId: number, error: string): Promise<void> {
  const { db } = await getDb()
  await patch(db, itemId, { outcome: 'blocked', outcomeReason: error.slice(0, 500), error: error.slice(0, 2000) })
}

/** A digest's links point at reports we have; the digest joins each of their events. */
async function attachRoundup(db: Db, item: RawItem): Promise<number> {
  const links = item.links ?? []
  if (!links.length) return 0
  const rows = await db
    .select({ eventId: eventItems.eventId })
    .from(rawItems)
    .innerJoin(eventItems, and(eq(eventItems.itemId, rawItems.id), ne(eventItems.relation, 'roundup')))
    .where(inArray(rawItems.url, links))
  const eventIds = [...new Set(rows.map((row) => row.eventId))]
  if (eventIds.length) {
    await db
      .insert(eventItems)
      .values(eventIds.map((eventId) => ({ eventId, itemId: item.id, relation: 'roundup' as const })))
      .onConflictDoNothing()
  }
  return eventIds.length
}

async function namesOf(payload: Loaded['payload'], ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map()
  const { docs } = await payload.find({ collection: 'sources', where: { id: { in: ids } }, pagination: false, limit: ids.length })
  return new Map(docs.map((doc) => [doc.id, doc.name]))
}

export type StaleItems = { judge: number[]; content: number[] }

/**
 * Items the sweep should push along: fresh ones whose body is fetched but whose judging never
 * started or stalled, and fresh ones whose body fetch never ran.
 */
export async function findStaleItems(now: Date, limit = 50): Promise<StaleItems> {
  const { db } = await getDb()
  const stalledBefore = new Date(now.getTime() - 30 * 60_000)
  const forgottenBefore = new Date(now.getTime() - 60 * 60_000)

  const judge = await db
    .select({ id: rawItems.id })
    .from(rawItems)
    .leftJoin(itemAnalyses, eq(itemAnalyses.itemId, rawItems.id))
    .where(
      and(
        eq(rawItems.status, 'fresh'),
        ne(rawItems.contentStatus, 'pending'),
        or(isNull(itemAnalyses.id), and(eq(itemAnalyses.outcome, 'pending'), lt(itemAnalyses.updatedAt, stalledBefore))),
      ),
    )
    .orderBy(rawItems.id)
    .limit(limit)

  const content = await db
    .select({ id: rawItems.id })
    .from(rawItems)
    .where(and(eq(rawItems.status, 'fresh'), eq(rawItems.contentStatus, 'pending'), lt(rawItems.discoveredAt, forgottenBefore)))
    .orderBy(rawItems.id)
    .limit(limit)

  return { judge: judge.map((row) => row.id), content: content.map((row) => row.id) }
}
