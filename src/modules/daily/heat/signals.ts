import { inArray, sql } from '@payloadcms/db-postgres/drizzle'

import type { getDb } from '@/lib/db/drizzle'

import { hotSignals, rawItems } from '../schema'
import type { FoundItem } from '../types'

type Db = Awaited<ReturnType<typeof getDb>>['db']

export type HotSignalRow = typeof hotSignals.$inferInsert

/**
 * The hot_signals rows for one fetch of a hot_signal source: every found link we have as a
 * report (whichever source found it first) and that came with points, comments or a thread.
 * A link submitted twice keeps its best numbers and its first thread.
 */
export function hotSignalRows(found: readonly FoundItem[], itemIds: ReadonlyMap<string, number>, sourceId: number, now: Date): HotSignalRow[] {
  const rows = new Map<number, HotSignalRow>()
  for (const item of found) {
    const itemId = itemIds.get(item.url)
    if (itemId === undefined || (!item.signals && !item.discussionUrl)) continue
    const row: HotSignalRow = {
      itemId,
      sourceId,
      points: Math.max(0, Math.round(item.signals?.points ?? 0)),
      comments: Math.max(0, Math.round(item.signals?.comments ?? 0)),
      discussionUrl: item.discussionUrl ?? null,
      postedAt: item.publishedAt && item.publishedAt.getTime() <= now.getTime() ? item.publishedAt : now,
      firstSeenAt: now,
      updatedAt: now,
    }
    const earlier = rows.get(itemId)
    rows.set(
      itemId,
      earlier
        ? {
            ...earlier,
            points: Math.max(earlier.points ?? 0, row.points ?? 0),
            comments: Math.max(earlier.comments ?? 0, row.comments ?? 0),
            discussionUrl: earlier.discussionUrl ?? row.discussionUrl,
          }
        : row,
    )
  }
  return [...rows.values()]
}

/**
 * Record what a hot_signal source says about links we already have: points and comments only
 * grow, the first thread link stays. Called after the fetch's new items are stored, so the
 * source's own new links are covered too.
 */
export async function recordHotSignals(db: Db, sourceId: number, found: readonly FoundItem[], now: Date): Promise<number> {
  const relevant = found.filter((item) => item.signals || item.discussionUrl)
  if (!relevant.length) return 0
  const known = await db
    .select({ id: rawItems.id, url: rawItems.url })
    .from(rawItems)
    .where(
      inArray(
        rawItems.url,
        relevant.map((item) => item.url),
      ),
    )
  const rows = hotSignalRows(relevant, new Map(known.map((row) => [row.url, row.id])), sourceId, now)
  if (!rows.length) return 0
  await db
    .insert(hotSignals)
    .values(rows)
    .onConflictDoUpdate({
      target: [hotSignals.itemId, hotSignals.sourceId],
      set: {
        points: sql`greatest(${hotSignals.points}, excluded.points)`,
        comments: sql`greatest(${hotSignals.comments}, excluded.comments)`,
        discussionUrl: sql`coalesce(${hotSignals.discussionUrl}, excluded.discussion_url)`,
        updatedAt: now,
      },
    })
  return rows.length
}
