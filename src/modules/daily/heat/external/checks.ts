import { and, eq, gte, inArray, sql } from '@payloadcms/db-postgres/drizzle'

import { ai, ModelCallError, xSearchAvailable } from '@/lib/ai'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { collectEnabled, modelCallsEnabled } from '@/lib/switches'

import { topicOf, type StoryEntity } from '../../entities'
import { reachPrompt } from '../../prompts'
import { events, heatChecks, type HeatCheckKind } from '../../schema'
import {
  CHECK_STORY_HOURS,
  checkWeight,
  dailyCheckLimit,
  dueEvents,
  searchOutlets,
  verifiedPosts,
  type CheckSubject,
  type SearchResult,
} from './rules'

const HOUR_MS = 3_600_000
const BRAVE_NEWS = 'https://api.search.brave.com/res/v1/news/search'
/** Brave's limit is 400 characters and 50 words. */
const MAX_QUERY_CHARS = 300

/** Whether each kind can run: Brave needs its key and COLLECT_ENABLED; X needs XAI_API_KEY and MODEL_CALLS_ENABLED. */
export function checksEnabled(env: Record<string, string | undefined> = process.env): Record<HeatCheckKind, boolean> {
  return {
    search: Boolean(env.BRAVE_SEARCH_API_KEY?.trim()) && collectEnabled(env),
    x: xSearchAvailable(env) && modelCallsEnabled(env),
  }
}

type Subject = CheckSubject & { summary: string }

/** Published stories of the last 48 hours with their events' heat, and when each kind last checked them. */
async function candidates(kind: HeatCheckKind, now: Date) {
  const { payload, db } = await getDb()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { and: [{ status: { equals: 'published' } }, { publishedAt: { greater_than_equal: new Date(now.getTime() - CHECK_STORY_HOURS * HOUR_MS).toISOString() } }] },
    pagination: false,
    depth: 0,
    locale: 'en',
    fallbackLocale: false,
    select: { eventId: true, title: true, summary: true, entities: true },
  })
  const ids = [...new Set(docs.map((doc) => doc.eventId))]
  if (!ids.length) return { subjects: new Map<number, Subject>(), list: [] }
  const [heats, last] = await Promise.all([
    db.select({ id: events.id, heat: events.heat }).from(events).where(inArray(events.id, ids)),
    db
      .select({ eventId: heatChecks.eventId, at: sql<Date>`max(${heatChecks.checkedAt})`.mapWith((value) => new Date(value)) })
      .from(heatChecks)
      .where(and(inArray(heatChecks.eventId, ids), eq(heatChecks.kind, kind)))
      .groupBy(heatChecks.eventId),
  ])
  const heatOf = new Map(heats.map((row) => [row.id, row.heat]))
  const lastOf = new Map(last.map((row) => [row.eventId, row.at]))
  const subjects = new Map<number, Subject>()
  for (const doc of docs) {
    if (!doc.title || subjects.has(doc.eventId)) continue
    const entities = (doc.entities ?? []) as StoryEntity[]
    subjects.set(doc.eventId, { eventId: doc.eventId, title: doc.title, topic: topicOf(entities)?.name ?? null, summary: doc.summary ?? '' })
  }
  // A story whose event is gone (sample data) has nothing to attach a check to.
  const list = [...subjects.keys()]
    .filter((eventId) => heatOf.has(eventId))
    .map((eventId) => ({ eventId, heat: heatOf.get(eventId) ?? 0, lastChecked: lastOf.get(eventId) ?? null }))
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

/** Brave's news search for the last day; the fields we read, whatever else comes back. */
async function braveNews(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = new URL(BRAVE_NEWS)
  url.searchParams.set('q', query.slice(0, MAX_QUERY_CHARS))
  url.searchParams.set('freshness', 'pd')
  url.searchParams.set('count', '50')
  url.searchParams.set('country', 'ALL')
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Brave news search: HTTP ${response.status}`)
  const body = (await response.json()) as { results?: unknown }
  const results = Array.isArray(body.results) ? body.results : []
  return results.flatMap((raw): SearchResult[] => {
    const result = raw as { url?: unknown; title?: unknown; description?: unknown; meta_url?: { hostname?: unknown } }
    if (typeof result.url !== 'string') return []
    return [
      {
        url: result.url,
        title: typeof result.title === 'string' ? result.title : '',
        description: typeof result.description === 'string' ? result.description : '',
        hostname: typeof result.meta_url?.hostname === 'string' ? result.meta_url.hostname : null,
      },
    ]
  })
}

/** The YYYY-MM-DD (UTC) of an instant, as xAI's search dates want. */
const day = (at: Date) => at.toISOString().slice(0, 10)

type Found = { hits: number; engagement: number; details: unknown[] }

async function check(kind: HeatCheckKind, subject: Subject, now: Date): Promise<Found> {
  if (kind === 'search') {
    const outlets = searchOutlets(subject, await braveNews(subject.title, process.env.BRAVE_SEARCH_API_KEY?.trim() ?? ''))
    return { hits: outlets.length, engagement: 0, details: outlets }
  }
  const { output } = await ai.xSearch({
    purpose: 'reach',
    instructions: reachPrompt.instructions,
    prompt: reachPrompt.build(subject),
    schema: reachPrompt.schema,
    fromDate: day(new Date(now.getTime() - 24 * HOUR_MS)),
    toDate: day(now),
    // One check per event and kind every 12 hours: a retry in the same hour reuses the receipt.
    variant: now.toISOString().slice(0, 13),
    subject: `events:${subject.eventId}`,
    temperature: 0,
  })
  const { posts, engagement } = verifiedPosts(output.answer.posts, output.sources)
  return { hits: Math.max(posts.length, Math.min(output.answer.seen, 10_000)), engagement: Math.min(engagement, 2_000_000_000), details: posts }
}

export type CheckRun = { kind: HeatCheckKind; checked: number; failed: number; events: number[]; stopped?: string }

/**
 * Check the hottest stories not checked in the last 12 hours with one channel, within the
 * run's and the day's caps, and store each result. A Brave error skips that story; a model
 * call that cannot run (switch off, budget used up) stops the X checks for this run.
 */
export async function runChecks(kind: HeatCheckKind, now = new Date()): Promise<CheckRun> {
  const run: CheckRun = { kind, checked: 0, failed: 0, events: [] }
  if (!checksEnabled()[kind]) return { ...run, stopped: 'disabled' }
  const room = dailyCheckLimit(kind) - (await usedToday(kind, now))
  if (room <= 0) return { ...run, stopped: 'daily limit' }
  const { subjects, list } = await candidates(kind, now)
  const { db } = await getDb()
  for (const eventId of dueEvents(list, room, now)) {
    const subject = subjects.get(eventId)
    if (!subject) continue
    try {
      const found = await check(kind, subject, now)
      const value = kind === 'search' ? found.hits : found.engagement
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

