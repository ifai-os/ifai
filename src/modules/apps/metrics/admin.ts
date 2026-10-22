import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, desc, eq, gte } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import type { Locale } from '@/i18n/config'

import { appHeatRuns, appMentions, appMetricsDaily, type MentionBasis } from '../schema'

/**
 * What the back office reads and changes about heat. This file stays free of the Payload
 * config, so the collection (through ./endpoints) can import it; it works on the Payload
 * instance the request already has.
 */

/** Send this event (data `{}`) to run the heat job now instead of waiting for 06:00. */
export const heatEvent = 'apps/heat.run'

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export type HeatRun = typeof appHeatRuns.$inferSelect
export type HeatRow = typeof appMetricsDaily.$inferSelect

/** The latest run, and the latest one that finished (the heat the pages show). */
export async function heatRuns(payload: Payload): Promise<{ latest: HeatRun | null; lastDone: HeatRun | null }> {
  const db = drizzleOf(payload)
  const [latest] = await db.select().from(appHeatRuns).orderBy(desc(appHeatRuns.day)).limit(1)
  if (!latest || latest.status === 'done') return { latest: latest ?? null, lastDone: latest ?? null }
  const [lastDone] = await db
    .select()
    .from(appHeatRuns)
    .where(eq(appHeatRuns.status, 'done'))
    .orderBy(desc(appHeatRuns.day))
    .limit(1)
  return { latest, lastDone: lastDone ?? null }
}

/** An app's daily rows from `since` on, newest first. */
export async function appHeatRows(payload: Payload, appId: number, since: string): Promise<HeatRow[]> {
  return drizzleOf(payload)
    .select()
    .from(appMetricsDaily)
    .where(and(eq(appMetricsDaily.appId, appId), gte(appMetricsDaily.day, since)))
    .orderBy(desc(appMetricsDaily.day))
}

export type AppMentionRow = {
  id: number
  storyId: number
  title: string
  slug: string
  basis: MentionBasis
  matched: string
  publishedAt: string
  removed: boolean
}

/** An app's matched stories, newest first, titled in the given language. */
export async function listAppMentions(payload: Payload, appId: number, locale: Locale, limit = 50): Promise<AppMentionRow[]> {
  const rows = await drizzleOf(payload)
    .select()
    .from(appMentions)
    .where(eq(appMentions.appId, appId))
    .orderBy(desc(appMentions.publishedAt))
    .limit(limit)
  if (rows.length === 0) return []
  const { docs } = await payload.find({
    collection: 'stories',
    where: { id: { in: rows.map((row) => row.storyId) } },
    pagination: false,
    depth: 0,
    locale,
    select: { title: true, slug: true },
  })
  const stories = new Map(docs.map((doc) => [doc.id, doc]))
  return rows.map((row) => ({
    id: row.id,
    storyId: row.storyId,
    title: stories.get(row.storyId)?.title ?? '',
    slug: stories.get(row.storyId)?.slug ?? '',
    basis: row.basis,
    matched: row.matched,
    publishedAt: row.publishedAt.toISOString(),
    removed: row.removedAt !== null,
  }))
}

/** The site owner marks a match wrong (or takes that back); heat follows at the next daily run. */
export async function setMentionRemoved(payload: Payload, appId: number, mentionId: number, removed: boolean): Promise<boolean> {
  const updated = await drizzleOf(payload)
    .update(appMentions)
    .set({ removedAt: removed ? new Date() : null })
    .where(and(eq(appMentions.id, mentionId), eq(appMentions.appId, appId)))
    .returning({ id: appMentions.id })
  return updated.length > 0
}
