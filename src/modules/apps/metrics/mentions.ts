import { and, eq, gte, inArray, isNull, lt, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { getDb } from '@/lib/db/drizzle'
import { itemAnalyses, rawItems } from '@/modules/daily/schema'

import { appMentions } from '../schema'
import { matchMentions, type MentionStory } from './match'
import { loadPublishedApps } from './published'

type Db = Awaited<ReturnType<typeof getDb>>['db']

/** Published stories in [since, until), with the products, companies and addresses matching reads. */
async function loadStories(payload: Payload, db: Db, since: Date, until: Date): Promise<MentionStory[]> {
  const { docs } = await payload.find({
    collection: 'stories',
    where: {
      and: [
        { status: { equals: 'published' } },
        { publishedAt: { greater_than_equal: since.toISOString() } },
        { publishedAt: { less_than: until.toISOString() } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { eventId: true, representativeItemId: true, publishedAt: true, sources: true },
  })
  if (docs.length === 0) return []

  // The daily pipeline's analysis of each story's report (日报第 3 步): read-only here.
  const rows = await db
    .select({ itemId: itemAnalyses.itemId, structure: itemAnalyses.structure, url: rawItems.url })
    .from(itemAnalyses)
    .innerJoin(rawItems, eq(rawItems.id, itemAnalyses.itemId))
    .where(inArray(itemAnalyses.itemId, [...new Set(docs.map((doc) => doc.representativeItemId))]))
  const byItem = new Map(rows.map((row) => [row.itemId, row]))

  return docs.flatMap((doc) => {
    if (!doc.publishedAt) return []
    const report = byItem.get(doc.representativeItemId)
    return [
      {
        id: doc.id,
        eventId: doc.eventId ?? null,
        publishedAt: doc.publishedAt,
        names: [...(report?.structure?.products ?? []), ...(report?.structure?.companies ?? [])],
        urls: [...(doc.sources ?? []).map((source) => source.url), ...(report ? [report.url] : [])],
      },
    ]
  })
}

/**
 * Match the stories published in [since, until) against the published apps and bring
 * `app_mentions` in line: new matches are added, matches that no longer hold (the story was
 * withdrawn, the app's name changed) are dropped. Matches the site owner removed stay removed.
 * Returns how many stories were read and how many matches count (removed ones do not).
 */
export async function syncMentions(since: Date, until: Date): Promise<{ stories: number; mentions: number }> {
  const { payload, db } = await getDb()
  const [stories, apps] = await Promise.all([loadStories(payload, db, since, until), loadPublishedApps(payload)])
  const found = matchMentions(stories, apps)
  const keys = new Set(found.map((mention) => `${mention.appId}:${mention.storyId}`))

  const removed = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: appMentions.id, appId: appMentions.appId, storyId: appMentions.storyId, removedAt: appMentions.removedAt })
      .from(appMentions)
      .where(and(gte(appMentions.publishedAt, since), lt(appMentions.publishedAt, until)))
    const stale = existing
      .filter((row) => row.removedAt === null && !keys.has(`${row.appId}:${row.storyId}`))
      .map((row) => row.id)
    if (stale.length > 0) await tx.delete(appMentions).where(inArray(appMentions.id, stale))

    for (let start = 0; start < found.length; start += 500) {
      await tx
        .insert(appMentions)
        .values(found.slice(start, start + 500).map((mention) => ({ ...mention, publishedAt: new Date(mention.publishedAt) })))
        .onConflictDoUpdate({
          target: [appMentions.appId, appMentions.storyId],
          set: {
            basis: sql`excluded.basis`,
            matched: sql`excluded.matched`,
            eventId: sql`excluded.event_id`,
            publishedAt: sql`excluded.published_at`,
          },
        })
    }
    return existing.filter((row) => row.removedAt !== null && keys.has(`${row.appId}:${row.storyId}`)).length
  })
  return { stories: stories.length, mentions: found.length - removed }
}

/** Stories about each app published in [since, until), counting one per event; removed matches do not count. */
export async function mentionCounts(db: Db, since: Date, until: Date): Promise<Map<number, number>> {
  const rows = await db
    .select({
      appId: appMentions.appId,
      count: sql<number>`count(distinct coalesce(${appMentions.eventId}, -${appMentions.storyId}))`.mapWith(Number),
    })
    .from(appMentions)
    .where(and(isNull(appMentions.removedAt), gte(appMentions.publishedAt, since), lt(appMentions.publishedAt, until)))
    .groupBy(appMentions.appId)
  return new Map(rows.map((row) => [row.appId, row.count]))
}
