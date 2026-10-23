import { and, eq, gte, ne } from '@payloadcms/db-postgres/drizzle'

import { ai as defaultAi } from '@/lib/ai'
import { getDb } from '@/lib/db/drizzle'
import type { Source, Story } from '@/payload-types'

import { storedHeat } from '../heat/heat'
import { trendOf } from '../heat/rules'
import { syncEventSources } from '../heat/sources'
import type { JudgeDeps } from '../judge/judge'
import { writePrompt, writtenLocales, type WriteReport, type WrittenLocaleKey } from '../prompts/write'
import { hansHash } from '../review/rules'
import { eventItems, itemAnalyses, rawItems } from '../schema'
import type { SourceTier } from '../types'
import { storySlug } from './slug'
import { verifyWriting } from './verify'

export type WriteOutcome =
  | { status: 'written'; storyId: number; slug: string; verified: boolean }
  /** Nothing to write: not queued, or already written. */
  | { status: 'skipped'; reason: string }

/** At most this many member reports go into the prompt besides the report itself. */
const MAX_EXTRA_REPORTS = 3

const tierRank: Record<SourceTier, number> = { T1: 0, T1_5: 1, T2: 2 }

export type Member = {
  item: typeof rawItems.$inferSelect
  relation: (typeof eventItems.$inferSelect)['relation']
  newInformation: boolean
  structure: (typeof itemAnalyses.$inferSelect)['structure']
}

/** The reports behind one story: what the prompt sees, and every report the source list names. */
export type StoryReports = {
  self: Member
  /** The report itself plus up to three others (or, for a follow-up, the earlier reports as background). */
  prompt: WriteReport[]
  /** Every report of the same happening, for the story's source list. */
  all: WriteReport[]
}

/**
 * Write the story for one queued report (docs/specs/daily.md「流程」7): one model call gives
 * the title, answer-first summary, optional try-it and the English slug in zh-Hans, en, ja and
 * ko; zh-Hant is converted from zh-Hans by the collection's hook. Every name and number is then looked up in the reports
 * and what is missing is stored for the reviewer. The result is a `stories` document awaiting
 * review.
 */
export async function writeStory(itemId: number, deps: JudgeDeps = {}): Promise<WriteOutcome> {
  const { payload, db } = await getDb()
  const ai = deps.ai ?? defaultAi
  const now = deps.now?.() ?? new Date()

  const [analysis] = await db.select().from(itemAnalyses).where(eq(itemAnalyses.itemId, itemId)).limit(1)
  if (!analysis) return { status: 'skipped', reason: 'no analysis' }
  if (analysis.outcome !== 'queued' || !analysis.eventId) return { status: 'skipped', reason: `outcome is ${analysis.outcome}` }
  const existing = await payload.find({
    collection: 'stories',
    where: { representativeItemId: { equals: itemId } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs[0]) return { status: 'skipped', reason: `story ${existing.docs[0].id} exists` }

  const reports = await loadReports(itemId, analysis.eventId)
  if (!reports) return { status: 'skipped', reason: 'report is not a member of its event' }

  const { output, model } = await ai.object({
    purpose: 'write',
    subject: `raw_items:${itemId}`,
    instructions: writePrompt.instructions,
    prompt: writePrompt.build(reports.prompt),
    schema: writePrompt.schema,
    temperature: 0.3,
  })

  const material = materialOf(reports.prompt)
  const keys = Object.keys(writtenLocales) as WrittenLocaleKey[]
  const verification = verifyWriting(
    Object.fromEntries(keys.map((key) => [writtenLocales[key], [output[key].title, output[key].summary, output[key].tryIt].join('\n')])),
    material,
  )
  const slug = await uniqueSlug(payload, storySlug(output.slug, output.en.title, itemId))
  const at = now.toISOString()
  // The other languages remember which simplified Chinese they were written from (review rules).
  const basedOn = hansHash(output.zhHans)
  const category = analysis.structure?.category ?? 'industry'
  const heat = await storedHeat(analysis.eventId)

  const story = await payload.create({
    collection: 'stories',
    locale: 'zh-Hans',
    data: {
      ...output.zhHans,
      slug,
      category,
      status: 'pending',
      eventId: analysis.eventId,
      representativeItemId: itemId,
      sources: storySources(reports.all, reports.self),
      score: analysis.scoreAverage,
      heat: heat?.heat ?? 0,
      heatTrend: heat ? trendOf(heat.heat, heat.before) : null,
      flags: analysis.flags ?? [],
      verification,
      localeStatus: {
        'zh-Hans': { status: 'written', at, model },
        ...Object.fromEntries(keys.filter((key) => key !== 'zhHans').map((key) => [writtenLocales[key], { status: 'written', at, model, basedOn }])),
        'zh-Hant': { status: 'converted', at },
      },
      promptVersion: writePrompt.version,
    },
  })
  // The zh-Hans create above also wrote zh-Hant through the collection's sync hook.
  for (const key of keys) {
    if (key === 'zhHans') continue
    await payload.update({ collection: 'stories', id: story.id, locale: writtenLocales[key], data: output[key] })
  }
  // Reports that joined while the model was writing, and Hacker News threads about them.
  await syncEventSources([analysis.eventId])
  return { status: 'written', storyId: story.id, slug, verified: verification.ok }
}

type Db = Awaited<ReturnType<typeof getDb>>['db']
type Payload = Awaited<ReturnType<typeof getDb>>['payload']

/** The reports of a story's event, from the report's own point of view (null when it left the event). */
export async function loadReports(itemId: number, eventId: number): Promise<StoryReports | null> {
  const { payload, db } = await getDb()
  const members = await loadMembers(db, eventId)
  const self = members.find((member) => member.item.id === itemId)
  if (!self) return null
  const sources = await sourcesOf(payload, members)
  return reportsFor(self, members, sources)
}

/** The text every name and number of the written story is checked against. */
export function materialOf(reports: WriteReport[]): string {
  return reports.map((report) => [report.title, report.summary, report.content].filter(Boolean).join('\n')).join('\n')
}

async function loadMembers(db: Db, eventId: number): Promise<Member[]> {
  const rows = await db
    .select({
      item: rawItems,
      relation: eventItems.relation,
      newInformation: eventItems.newInformation,
      structure: itemAnalyses.structure,
    })
    .from(eventItems)
    .innerJoin(rawItems, eq(rawItems.id, eventItems.itemId))
    .leftJoin(itemAnalyses, eq(itemAnalyses.itemId, rawItems.id))
    .where(and(eq(eventItems.eventId, eventId), ne(eventItems.relation, 'roundup')))
  return rows
}

async function sourcesOf(payload: Payload, members: Member[]): Promise<Map<number, Source>> {
  const ids = [...new Set(members.map((member) => member.item.sourceId))]
  const { docs } = await payload.find({ collection: 'sources', where: { id: { in: ids } }, pagination: false, limit: ids.length, depth: 0 })
  return new Map(docs.map((doc) => [doc.id, doc]))
}

/**
 * The report itself plus, for the event's main story, the other reports of the same happening
 * (official sources first, then ones with new details); for a follow-up, the event's earlier
 * reports as background only. The prompt gets at most three others; the source list gets all.
 */
function reportsFor(self: Member, members: Member[], sources: Map<number, Source>): StoryReports {
  const toReport = (member: Member, background = false): WriteReport => {
    const source = sources.get(member.item.sourceId)
    return {
      sourceName: source?.name ?? `source ${member.item.sourceId}`,
      tier: source?.tier ?? 'T2',
      url: member.item.url,
      publishedAt: member.item.publishedAt,
      title: member.item.title,
      summary: member.item.summary,
      content: member.item.content,
      facts: member.structure?.facts,
      background,
    }
  }
  const others = members
    .filter((member) => member.item.id !== self.item.id && member.relation === 'same')
    .sort((a, b) => {
      const tier = tierRank[sources.get(a.item.sourceId)?.tier ?? 'T2'] - tierRank[sources.get(b.item.sourceId)?.tier ?? 'T2']
      if (tier) return tier
      if (a.newInformation !== b.newInformation) return a.newInformation ? -1 : 1
      return (a.item.publishedAt?.getTime() ?? 0) - (b.item.publishedAt?.getTime() ?? 0)
    })
  const few = others.slice(0, MAX_EXTRA_REPORTS)

  if (self.relation === 'follow_up') {
    // A follow-up stands on its own; the earlier reports are context, not sources of it.
    return { self, prompt: [toReport(self), ...few.map((member) => toReport(member, true))], all: [toReport(self)] }
  }
  // The main story: the official source leads when there is one.
  const byTier = (a: WriteReport, b: WriteReport) => tierRank[a.tier] - tierRank[b.tier]
  return {
    self,
    prompt: [toReport(self), ...few.map((member) => toReport(member))].sort(byTier),
    all: [toReport(self), ...others.map((member) => toReport(member))].sort(byTier),
  }
}

export type StorySource = Omit<NonNullable<Story['sources']>[number], 'id'>

/** The story's source list: the original first, reports after, discussion threads last. */
export function storySources(reports: WriteReport[], self: Member): StorySource[] {
  const list: StorySource[] = reports
    .filter((report) => !report.background)
    .map((report, index) => ({
      name: report.sourceName,
      url: report.url,
      publishedAt: report.publishedAt ? new Date(report.publishedAt).toISOString() : null,
      role: index === 0 ? 'original' : 'report',
    }))
  if (self.item.discussionUrl) {
    list.push({ name: 'Hacker News', url: self.item.discussionUrl, publishedAt: null, role: 'discussion' })
  }
  return list
}

async function uniqueSlug(payload: Payload, base: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 76)}-${n}`
    const { totalDocs } = await payload.count({ collection: 'stories', where: { slug: { equals: slug } } })
    if (totalDocs === 0) return slug
  }
  return `${base.slice(0, 60)}-${Date.now()}`
}

/** Queued reports of the last 7 days that have no story yet, for the sweep. */
export async function findUnwritten(now: Date, limit = 20): Promise<number[]> {
  const { payload, db } = await getDb()
  const since = new Date(now.getTime() - 7 * 86_400_000)
  const queued = await db
    .select({ itemId: itemAnalyses.itemId })
    .from(itemAnalyses)
    .where(and(eq(itemAnalyses.outcome, 'queued'), gte(itemAnalyses.updatedAt, since)))
    .orderBy(itemAnalyses.itemId)
    .limit(200)
  if (!queued.length) return []
  const ids = queued.map((row) => row.itemId)
  const { docs } = await payload.find({
    collection: 'stories',
    where: { representativeItemId: { in: ids } },
    pagination: false,
    limit: ids.length,
    depth: 0,
  })
  const written = new Set(docs.map((doc) => doc.representativeItemId))
  return ids.filter((id) => !written.has(id)).slice(0, limit)
}
