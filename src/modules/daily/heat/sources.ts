import { and, eq, inArray, isNotNull } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { refreshDailyCache } from '../review/cache'
import { eventItems, events, hotSignals, rawItems } from '../schema'
import { planSources, type MemberReport, type SourceEntry, type StoryRef, type ThreadLink } from './source-plan'

type Payload = Awaited<ReturnType<typeof getDb>>['payload']

export type SourceSync = { stories: number; published: number }

/** Source names by id, for the entries added to source lists. */
export async function sourceNames(payload: Payload): Promise<Map<number, string>> {
  const { docs } = await payload.find({ collection: 'sources', pagination: false, depth: 0, select: { name: true } })
  return new Map(docs.map((doc) => [doc.id, doc.name]))
}

/** The addresses a story has been offered, as saved; null before its first check. */
function seenOf(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null
}

/**
 * Bring the source lists of these events' stories up to date (see ./source-plan.ts): reports
 * that joined later and Hacker News threads are added, each story remembers which addresses
 * it was offered, and the site's pages are refreshed when a published story changed.
 */
export async function syncEventSources(eventIds: readonly number[]): Promise<SourceSync> {
  const ids = [...new Set(eventIds)]
  if (!ids.length) return { stories: 0, published: 0 }
  const { payload, db } = await getDb()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { and: [{ eventId: { in: ids } }, { status: { in: ['pending', 'published', 'withdrawn'] } }] },
    pagination: false,
    depth: 0,
    select: { eventId: true, representativeItemId: true, sources: true, sourcesSeen: true, createdAt: true, status: true },
  })
  if (!docs.length) return { stories: 0, published: 0 }

  const withStories = [...new Set(docs.map((doc) => doc.eventId))]
  const [eventRows, memberRows, names] = await Promise.all([
    db.select({ id: events.id, representativeItemId: events.representativeItemId }).from(events).where(inArray(events.id, withStories)),
    db
      .select({
        eventId: eventItems.eventId,
        itemId: eventItems.itemId,
        relation: eventItems.relation,
        matchedItemId: eventItems.matchedItemId,
        sourceId: rawItems.sourceId,
        url: rawItems.url,
        publishedAt: rawItems.publishedAt,
      })
      .from(eventItems)
      .innerJoin(rawItems, eq(rawItems.id, eventItems.itemId))
      .where(inArray(eventItems.eventId, withStories)),
    sourceNames(payload),
  ])
  const itemIds = [...new Set(memberRows.map((row) => row.itemId))]
  const threadRows = itemIds.length
    ? await db
        .select({ itemId: hotSignals.itemId, sourceId: hotSignals.sourceId, url: hotSignals.discussionUrl })
        .from(hotSignals)
        .where(and(inArray(hotSignals.itemId, itemIds), isNotNull(hotSignals.discussionUrl)))
    : []
  const nameOf = (sourceId: number) => names.get(sourceId) ?? `source ${sourceId}`
  const status = new Map(docs.map((doc) => [doc.id, doc.status]))

  let stories = 0
  let published = 0
  for (const eventId of withStories) {
    const members: MemberReport[] = memberRows
      .filter((row) => row.eventId === eventId)
      .map((row) => ({ ...row, sourceName: nameOf(row.sourceId) }))
    const inEvent = new Set(members.map((member) => member.itemId))
    const threads: ThreadLink[] = threadRows
      .filter((row) => inEvent.has(row.itemId) && row.url)
      .map((row) => ({ itemId: row.itemId, sourceName: nameOf(row.sourceId), url: row.url! }))
    const refs: StoryRef[] = docs
      .filter((doc) => doc.eventId === eventId)
      .map((doc) => ({
        id: doc.id,
        representativeItemId: doc.representativeItemId,
        createdAt: new Date(doc.createdAt),
        seen: seenOf(doc.sourcesSeen),
        sources: (doc.sources ?? []).map(({ name, role, url, publishedAt }): SourceEntry => ({ name, role, url, publishedAt: publishedAt ?? null })),
      }))
    const plans = planSources({
      members,
      threads,
      stories: refs,
      eventReportId: eventRows.find((row) => row.id === eventId)?.representativeItemId ?? null,
    })
    for (const plan of plans) {
      await payload.update({
        collection: 'stories',
        id: plan.storyId,
        locale: 'zh-Hans',
        data: { ...(plan.sources && { sources: plan.sources }), sourcesSeen: plan.seen },
        context: { skipHantSync: true },
      })
      if (plan.sources) {
        stories++
        if (status.get(plan.storyId) === 'published') published++
      }
    }
  }
  if (published) await refreshDailyCache()
  return { stories, published }
}
