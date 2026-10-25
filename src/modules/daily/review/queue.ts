import { and, count, eq, gte } from '@payloadcms/db-postgres/drizzle'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate, shanghaiDayStart } from '@/lib/shanghai-day'
import { collectEnabled, modelCallsEnabled } from '@/lib/switches'

import { loadPosterDesk } from '../poster/desk'
import { events, itemAnalyses, rawItems } from '../schema'
import {
  analysesFor,
  failedLocalesOf,
  findDuplicates,
  findStoriesAll,
  flagsOf,
  hansOf,
  moreReportsOf,
  unverifiedCount,
} from './load'
import { compareQueue, hansHash, needsAttention, queueFlags } from './rules'
import type { QueueItem, ReviewQueue, ReviewSummary } from './types'

export type QueueDeps = { ai?: Ai; now?: () => Date }

/** Stories awaiting review (pending, and withdrawn ones that came back), ordered as the board says. */
export async function loadReviewQueue(deps: QueueDeps = {}): Promise<ReviewQueue> {
  const { payload, db } = await getDb()
  const now = deps.now?.() ?? new Date()
  const ai = deps.ai ?? defaultAi

  const stories = await findStoriesAll(payload, { status: { in: ['pending', 'withdrawn'] } })
  const [analyses, duplicates] = await Promise.all([
    analysesFor(
      db,
      stories.map((story) => story.representativeItemId),
    ),
    findDuplicates(db, payload, stories, now),
  ])

  const items: QueueItem[] = stories
    .map((story) => {
      const hans = hansOf(story)
      const analysis = analyses.get(story.representativeItemId)
      const original = story.sources?.[0]
      return {
        id: story.id,
        title: hans.title,
        category: story.category,
        status: story.status,
        score: story.score ?? null,
        scoreA: analysis?.scoreA ?? null,
        scoreB: analysis?.scoreB ?? null,
        heat: story.heat ?? 0,
        sourceName: original?.name ?? '',
        originalPublishedAt: original?.publishedAt ?? null,
        moreReports: moreReportsOf(story),
        failedLocales: failedLocalesOf(story, hansHash(hans)),
        unverified: unverifiedCount(story),
        duplicate: duplicates.get(story.id) ?? null,
        flags: flagsOf(story),
        laterAt: story.laterAt ?? null,
        createdAt: story.createdAt,
      }
    })
    .sort(compareQueue)

  const dayStart = shanghaiDayStart(now)
  const [poster, summary] = await Promise.all([loadPosterDesk(payload, shanghaiDate(now)), summarize(db, payload, ai, dayStart, items)])
  return { items, poster, summary, loadedAt: now.toISOString() }
}

async function summarize(
  db: Awaited<ReturnType<typeof getDb>>['db'],
  payload: Awaited<ReturnType<typeof getDb>>['payload'],
  ai: Ai,
  dayStart: Date,
  items: QueueItem[],
): Promise<ReviewSummary> {
  const [publishedCount, latest, sources, usage, intake] = await Promise.all([
    // The editor's day: what went up today, by approval rather than by the news's own time.
    payload.count({
      collection: 'stories',
      where: { and: [{ status: { equals: 'published' } }, { approvedAt: { greater_than_equal: dayStart.toISOString() } }] },
    }),
    payload.find({ collection: 'stories', where: { status: { equals: 'published' } }, sort: '-approvedAt', limit: 1, depth: 0 }),
    payload.find({ collection: 'sources', where: { enabled: { equals: true } }, pagination: false, limit: 200, depth: 0 }),
    ai.usageToday().catch(() => ({ costUsd: 0, calls: 0, budgetUsd: 0, enabled: false })),
    intakeToday(db, dayStart),
  ])
  return {
    pending: items.length,
    attention: items.filter((item) =>
      needsAttention(
        queueFlags({
          status: item.status,
          moreReports: item.moreReports,
          duplicate: Boolean(item.duplicate),
          unverified: item.unverified,
          failedLocales: item.failedLocales,
          scoreA: item.scoreA,
          scoreB: item.scoreB,
          flags: item.flags,
          laterAt: item.laterAt,
        }),
      ),
    ).length,
    publishedToday: publishedCount.totalDocs,
    lastPublishedAt: latest.docs[0]?.approvedAt ?? null,
    sources: {
      total: sources.totalDocs,
      failing: sources.docs.filter((source) => source.lastError).map((source) => ({ id: source.id, name: source.name, error: source.lastError ?? '' })),
    },
    usage: { costUsd: usage.costUsd, calls: usage.calls, budgetUsd: usage.budgetUsd },
    switches: { collect: collectEnabled(), modelCalls: modelCallsEnabled() },
    intake,
  }
}

async function intakeToday(db: Awaited<ReturnType<typeof getDb>>['db'], dayStart: Date) {
  const [[found], [made], [queued]] = await Promise.all([
    db.select({ n: count() }).from(rawItems).where(gte(rawItems.discoveredAt, dayStart)),
    db.select({ n: count() }).from(events).where(gte(events.createdAt, dayStart)),
    db
      .select({ n: count() })
      .from(itemAnalyses)
      .where(and(eq(itemAnalyses.outcome, 'queued'), gte(itemAnalyses.updatedAt, dayStart))),
  ])
  return { items: Number(found?.n ?? 0), events: Number(made?.n ?? 0), queued: Number(queued?.n ?? 0) }
}
