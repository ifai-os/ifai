import { and, eq, gte, inArray, sql } from '@payloadcms/db-postgres/drizzle'

import { ai, ModelCallError, xSearchAvailable } from '@/lib/ai'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { modelCallsEnabled } from '@/lib/switches'

import { topicOf, type StoryEntity } from '../../entities'
import { reachPrompt } from '../../prompts'
import { events, heatChecks, type HeatCheckKind } from '../../schema'
import {
  backfillDue,
  backfillSince,
  backfillWindow,
  CHECK_STORY_HOURS,
  checkWeight,
  dailyCheckLimit,
  dueEvents,
  verifiedPosts,
  type CheckSubject,
} from './rules'

const HOUR_MS = 3_600_000

/** Whether each kind can run: the news search (Brave) no longer does (2026-11-07); X needs XAI_API_KEY and MODEL_CALLS_ENABLED. */
export function checksEnabled(env: Record<string, string | undefined> = process.env): Record<HeatCheckKind, boolean> {
  return { search: false, x: xSearchAvailable(env) && modelCallsEnabled(env) }
}

type Subject = CheckSubject & { summary: string; publishedAt: Date }

/** Published stories of the last 48 hours with their events' heat, and whether this kind has checked them. */
async function candidates(kind: HeatCheckKind, now: Date) {
  const { payload, db } = await getDb()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { and: [{ status: { equals: 'published' } }, { publishedAt: { greater_than_equal: new Date(now.getTime() - CHECK_STORY_HOURS * HOUR_MS).toISOString() } }] },
    pagination: false,
    depth: 0,
    locale: 'en',
    fallbackLocale: false,
    sort: '-publishedAt',
    select: { eventId: true, title: true, summary: true, entities: true, publishedAt: true, importance: true, heatPeak: true },
  })
  const ids = [...new Set(docs.map((doc) => doc.eventId))]
  if (!ids.length) return { subjects: new Map<number, Subject>(), list: [] }
  const [heats, last] = await Promise.all([
    db.select({ id: events.id, heat: events.heat }).from(events).where(inArray(events.id, ids)),
    db.selectDistinct({ eventId: heatChecks.eventId }).from(heatChecks).where(and(inArray(heatChecks.eventId, ids), eq(heatChecks.kind, kind))),
  ])
  const heatOf = new Map(heats.map((row) => [row.id, row.heat]))
  const checked = new Set(last.map((row) => row.eventId))
  const subjects = new Map<number, Subject>()
  // An event's stories share its reach; the most important of them decides whether it is worth checking.
  const importanceOf = new Map<number, number>()
  const reachOf = new Map<number, number>()
  for (const doc of docs) {
    importanceOf.set(doc.eventId, Math.max(importanceOf.get(doc.eventId) ?? 0, doc.importance ?? 0))
    reachOf.set(doc.eventId, Math.max(reachOf.get(doc.eventId) ?? 0, doc.heatPeak ?? 0))
    if (!doc.title || !doc.publishedAt || subjects.has(doc.eventId)) continue
    const entities = (doc.entities ?? []) as StoryEntity[]
    subjects.set(doc.eventId, { eventId: doc.eventId, title: doc.title, topic: topicOf(entities)?.name ?? null, summary: doc.summary ?? '', publishedAt: new Date(doc.publishedAt) })
  }
  // A story whose event is gone (sample data) has nothing to attach a check to.
  const list = [...subjects.entries()]
    .filter(([eventId]) => heatOf.has(eventId))
    .map(([eventId, subject]) => ({
      eventId,
      heat: heatOf.get(eventId) ?? 0,
      checked: checked.has(eventId),
      publishedAt: subject.publishedAt,
      importance: importanceOf.get(eventId) ?? 0,
      reach: reachOf.get(eventId) ?? 0,
    }))
  return { subjects, list }
}

/** Checks of a kind already run today (Shanghai day), against the daily cap. */
async function usedToday(kind: HeatCheckKind, now: Date): Promise<number> {
  const { db } = await getDb()
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(heatChecks)
    .where(and(eq(heatChecks.kind, kind), gte(heatChecks.checkedAt, shanghaiDayStart(now))))
  return row?.count ?? 0
}

/** The YYYY-MM-DD (UTC) of an instant, as xAI's search dates want. */
const day = (at: Date) => at.toISOString().slice(0, 10)

/** What a check found: the X posts, and their views together as `engagement`. */
type Found = { hits: number; engagement: number; details: unknown[] }

/** The days a check searches. The variant names the call, so a retry of the same check reuses its receipt. */
type Window = { from: string; to: string; variant: string }

/** The regular check, once per event: every day since the story came out, as its views add up. The hour names the call. */
const regular = (subject: Subject, now: Date): Window => ({ from: day(subject.publishedAt), to: day(now), variant: now.toISOString().slice(0, 13) })

async function check(kind: HeatCheckKind, subject: Subject, window: Window): Promise<Found> {
  if (kind !== 'x') throw new Error(`${kind} checks no longer run`)
  const { output } = await ai.xSearch({
    purpose: 'reach',
    instructions: reachPrompt.instructions,
    prompt: reachPrompt.build(subject),
    schema: reachPrompt.schema,
    fromDate: window.from,
    toDate: window.to,
    variant: window.variant,
    subject: `events:${subject.eventId}`,
    temperature: 0,
  })
  const { posts, views } = verifiedPosts(output.answer.posts, output.sources)
  return { hits: posts.length, engagement: Math.min(views, 2_000_000_000), details: posts }
}

export type CheckRun = { kind: HeatCheckKind; checked: number; failed: number; events: number[]; stopped?: string }

/**
 * Check the hottest stories worth checking that this channel has not checked yet (X only once
 * they are a day old), within the run's and the day's caps, and store each result. A Brave error skips that story; a model
 * call that cannot run (switch off, budget used up) stops the X checks for this run.
 */
export async function runChecks(kind: HeatCheckKind, now = new Date()): Promise<CheckRun> {
  const run: CheckRun = { kind, checked: 0, failed: 0, events: [] }
  if (!checksEnabled()[kind]) return { ...run, stopped: 'disabled' }
  const room = dailyCheckLimit(kind) - (await usedToday(kind, now))
  if (room <= 0) return { ...run, stopped: 'daily limit' }
  const { subjects, list } = await candidates(kind, now)
  const { db } = await getDb()
  for (const eventId of dueEvents(kind, list, room, now)) {
    const subject = subjects.get(eventId)
    if (!subject) continue
    try {
      const found = await check(kind, subject, regular(subject, now))
      const value = found.engagement
      await db.insert(heatChecks).values({ eventId, kind, hits: found.hits, engagement: found.engagement, weight: checkWeight(kind, value), details: found.details, checkedAt: now })
      run.checked++
      run.events.push(eventId)
    } catch (error) {
      run.failed++
      console.error(`[daily heat] ${kind} check of event ${eventId} failed:`, error instanceof Error ? error.message : error)
      if (error instanceof ModelCallError && !error.retryable) return { ...run, stopped: error.message }
    }
  }
  return run
}


/**
 * Catch up on older stories with one channel (./rules.ts「backfill」): up to `limit` events
 * published from HEAT_BACKFILL_SINCE (X: from 2026-11-01) until 48 hours ago, worth checking and not checked by the channel yet,
 * newest first, each searched over its first two days. The check is stored at the story's
 * publish time, so it counts towards the reach index with the story's own sources and adds
 * nothing to today's heat. Stops like `runChecks` when a model call cannot run.
 */
export async function runBackfill(kind: HeatCheckKind, limit: number, now = new Date()): Promise<CheckRun> {
  const run: CheckRun = { kind, checked: 0, failed: 0, events: [] }
  if (!checksEnabled()[kind]) return { ...run, stopped: 'disabled' }
  if (limit <= 0) return { ...run, stopped: 'daily limit' }
  const { payload, db } = await getDb()
  const since = backfillSince(process.env, kind)
  const { docs } = await payload.find({
    collection: 'stories',
    where: {
      and: [
        { status: { equals: 'published' } },
        { publishedAt: { greater_than_equal: since.toISOString() } },
        { publishedAt: { less_than: new Date(now.getTime() - CHECK_STORY_HOURS * HOUR_MS).toISOString() } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { eventId: true, publishedAt: true, importance: true, heatPeak: true },
  })
  const ids = [...new Set(docs.map((doc) => doc.eventId))]
  if (!ids.length) return run
  const [existing, checked] = await Promise.all([
    db.select({ id: events.id }).from(events).where(inArray(events.id, ids)),
    db.selectDistinct({ eventId: heatChecks.eventId }).from(heatChecks).where(and(inArray(heatChecks.eventId, ids), eq(heatChecks.kind, kind))),
  ])
  // A story whose event is gone (sample data) has nothing to attach a check to.
  const known = new Set(existing.map((row) => row.id))
  const stories = docs.flatMap((doc) =>
    doc.publishedAt && known.has(doc.eventId) ? [{ eventId: doc.eventId, publishedAt: new Date(doc.publishedAt), importance: doc.importance, reach: doc.heatPeak }] : [],
  )
  const due = backfillDue(stories, new Set(checked.map((row) => row.eventId)), since, now, limit)
  if (!due.length) return run

  const { docs: texts } = await payload.find({
    collection: 'stories',
    where: { and: [{ status: { equals: 'published' } }, { eventId: { in: due.map((story) => story.eventId) } }] },
    pagination: false,
    depth: 0,
    locale: 'en',
    fallbackLocale: false,
    sort: '-publishedAt',
    select: { eventId: true, title: true, summary: true, entities: true, publishedAt: true },
  })
  const subjects = new Map<number, Subject>()
  for (const doc of texts) {
    if (!doc.title || !doc.publishedAt || subjects.has(doc.eventId)) continue
    const entities = (doc.entities ?? []) as StoryEntity[]
    subjects.set(doc.eventId, { eventId: doc.eventId, title: doc.title, topic: topicOf(entities)?.name ?? null, summary: doc.summary ?? '', publishedAt: new Date(doc.publishedAt) })
  }

  for (const { eventId, publishedAt } of due) {
    const subject = subjects.get(eventId)
    if (!subject) continue
    const { from, to } = backfillWindow(publishedAt)
    try {
      const found = await check(kind, subject, { from, to, variant: `backfill-${from}` })
      const value = found.engagement
      await db.insert(heatChecks).values({ eventId, kind, hits: found.hits, engagement: found.engagement, weight: checkWeight(kind, value), details: found.details, checkedAt: publishedAt })
      run.checked++
      run.events.push(eventId)
    } catch (error) {
      run.failed++
      console.error(`[daily heat] ${kind} catch-up check of event ${eventId} failed:`, error instanceof Error ? error.message : error)
      if (error instanceof ModelCallError && !error.retryable) return { ...run, stopped: error.message }
    }
  }
  return run
}
