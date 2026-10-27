import { and, eq, gt, gte, inArray, ne, or } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { refreshDailyCache } from '../review/cache'
import { eventItems, events, hotSignals, rawItems } from '../schema'
import { HEAT_LOOKBACK_MS, eventHeat, peakHeat, peakOf, signalsOf, type EventHeat, type HeatMember } from './rules'

export type HeatRun = { events: number; stories: number; published: number }

/**
 * Events whose heat may be above zero now or 6 hours ago: seen in the last 54 hours, with heat
 * left over from the last run, or with a report a hot source discussed in that time.
 */
export async function activeEventIds(now = new Date()): Promise<number[]> {
  const { db } = await getDb()
  const since = new Date(now.getTime() - HEAT_LOOKBACK_MS)
  const [recent, discussed] = await Promise.all([
    db
      .select({ id: events.id })
      .from(events)
      .where(or(gte(events.lastSeenAt, since), gt(events.heat, 0), gt(events.heatBefore, 0))),
    db
      .selectDistinct({ id: eventItems.eventId })
      .from(eventItems)
      .innerJoin(hotSignals, eq(hotSignals.itemId, eventItems.itemId))
      .where(and(gte(hotSignals.postedAt, since), ne(eventItems.relation, 'roundup'))),
  ])
  return [...new Set([...recent, ...discussed].map((row) => row.id))].sort((a, b) => a - b)
}

/**
 * Work out these events' heat (./rules.ts), store it on the events and copy it to their
 * stories (the review queue and the pages read it there). Refreshes the site's pages when a
 * published story's heat, reach index (its peak) or mark changed.
 */
export async function refreshHeat(eventIds: readonly number[], now = new Date()): Promise<HeatRun> {
  const ids = [...new Set(eventIds)]
  if (!ids.length) return { events: 0, stories: 0, published: 0 }
  const { payload, db } = await getDb()

  const [members, sources] = await Promise.all([
    db
      .select({
        eventId: eventItems.eventId,
        itemId: eventItems.itemId,
        relation: eventItems.relation,
        sourceId: rawItems.sourceId,
        publishedAt: rawItems.publishedAt,
        discoveredAt: rawItems.discoveredAt,
        signals: rawItems.signals,
      })
      .from(eventItems)
      .innerJoin(rawItems, eq(rawItems.id, eventItems.itemId))
      .where(inArray(eventItems.eventId, ids)),
    payload.find({ collection: 'sources', pagination: false, depth: 0, select: { use: true } }),
  ])
  const itemIds = [...new Set(members.map((member) => member.itemId))]
  const threads = itemIds.length
    ? await db
        .select({
          itemId: hotSignals.itemId,
          sourceId: hotSignals.sourceId,
          points: hotSignals.points,
          postedAt: hotSignals.postedAt,
          firstSeenAt: hotSignals.firstSeenAt,
        })
        .from(hotSignals)
        .where(inArray(hotSignals.itemId, itemIds))
    : []
  const hot = new Set(sources.docs.filter((source) => source.use === 'hot_signal').map((source) => source.id))
  const signals = signalsOf(
    members.map((member): HeatMember => ({ ...member, points: member.signals?.points ?? null })),
    threads,
    (sourceId) => hot.has(sourceId),
  )

  const results = new Map<number, EventHeat & { peak: number }>()
  for (const id of ids) {
    const result = eventHeat(signals.get(id) ?? [], now)
    results.set(id, { ...result, peak: peakHeat(signals.get(id) ?? []) })
    await db.update(events).set({ heat: result.heat, heatBefore: result.before, heatUpdatedAt: now }).where(eq(events.id, id))
  }

  const { docs } = await payload.find({
    collection: 'stories',
    where: { eventId: { in: ids } },
    pagination: false,
    depth: 0,
    select: { eventId: true, heat: true, heatPeak: true, heatTrend: true, status: true },
  })
  let stories = 0
  let published = 0
  for (const doc of docs) {
    const result = results.get(doc.eventId)
    if (!result) continue
    const peak = peakOf(doc.heatPeak, result.peak)
    if ((doc.heat ?? 0) === result.heat && (doc.heatPeak ?? 0) === peak && (doc.heatTrend ?? null) === result.trend) continue
    await payload.update({
      collection: 'stories',
      id: doc.id,
      locale: 'zh-Hans',
      data: { heat: result.heat, heatPeak: peak, heatTrend: result.trend },
      context: { skipHantSync: true },
    })
    stories++
    if (doc.status === 'published') published++
  }
  if (published) await refreshDailyCache()
  return { events: ids.length, stories, published }
}

/** One event's heat as stored, for a story written right after grouping. */
export async function storedHeat(eventId: number): Promise<{ heat: number; before: number } | null> {
  const { db } = await getDb()
  const [row] = await db.select({ heat: events.heat, before: events.heatBefore }).from(events).where(eq(events.id, eventId)).limit(1)
  return row ?? null
}
