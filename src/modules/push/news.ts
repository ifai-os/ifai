import { eq } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'
import { errorMessage } from '@/modules/daily/collect/fetch'
import { eventItems, itemAnalyses, rawItems } from '@/modules/daily/schema'

import { pushedStatus, sourceOnSite, type NewsPush } from './rules'

type Payload = Awaited<ReturnType<typeof getDb>>['payload']

export type PushedStory = { id: number; slug: string; status: string }

export type NewsResult = {
  kind: 'news'
  /** `created`: a new report waiting for its body and judging; `known`: we already had this address. */
  action: 'created' | 'known'
  itemId: number
  url: string
  /** `archived`: published over 48 hours ago, kept on record only (the collection rules). */
  status: 'fresh' | 'archived'
  source: { id: number; name: string; created: boolean }
  /** For a known report: how judging went, and the story it ended up in. */
  outcome?: string | null
  outcomeReason?: string | null
  story?: PushedStory | null
  queued?: { ok: true } | { ok: false; error: string }
}

/**
 * The source the report belongs to: one we already collect from on that site (so its tier and name
 * apply), or a new disabled one named after the site, which is never fetched. The source name is
 * what the story shows as the publisher, which is why pushes do not share one "browser" source.
 */
async function sourceFor(payload: Payload, push: NewsPush): Promise<NewsResult['source']> {
  const { docs } = await payload.find({
    collection: 'sources',
    pagination: false,
    depth: 0,
    select: { name: true, url: true, homepage: true, enabled: true },
  })
  const onSite = docs.filter((source) => sourceOnSite(source, push.site))
  const existing = onSite.find((source) => source.enabled) ?? onSite[0]
  if (existing) return { id: existing.id, name: existing.name, created: false }

  const created = await payload.create({
    collection: 'sources',
    data: {
      name: push.siteName ?? push.site,
      type: 'rss',
      tier: 'T1',
      use: 'editorial',
      url: `https://${push.site}`,
      homepage: `https://${push.site}`,
      intervalMinutes: 180,
      enabled: false,
      notes: '浏览器推送时自动建的，只用来记推送来的报道，不抓取（docs/specs/push.md）。要定时抓这个网站，换成它的订阅源地址再启用。',
    },
    depth: 0,
  })
  return { id: created.id, name: created.name, created: true }
}

async function storyOf(payload: Payload, db: Awaited<ReturnType<typeof getDb>>['db'], itemId: number): Promise<PushedStory | null> {
  const [member] = await db.select({ eventId: eventItems.eventId }).from(eventItems).where(eq(eventItems.itemId, itemId)).limit(1)
  if (!member) return null
  const { docs } = await payload.find({
    collection: 'stories',
    where: { eventId: { equals: member.eventId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { slug: true, status: true },
  })
  const story = docs[0]
  return story ? { id: story.id, slug: story.slug, status: story.status } : null
}

/**
 * A pushed article joins raw_items exactly like a collected one: the same normalized address
 * (unique, so a link any source already found is reported, not added twice), then the body fetch,
 * judging (grouping into an existing event happens there) and writing, which ends in the review queue.
 */
export async function pushNews(push: NewsPush, now: Date = new Date()): Promise<NewsResult> {
  const { payload, db } = await getDb()

  const [known] = await db
    .select({ id: rawItems.id, status: rawItems.status, sourceId: rawItems.sourceId })
    .from(rawItems)
    .where(eq(rawItems.url, push.url))
    .limit(1)
  if (known) return knownResult(payload, db, push.url, known)

  const source = await sourceFor(payload, push)
  const status = pushedStatus(push.publishedAt, now)
  const [inserted] = await db
    .insert(rawItems)
    .values({
      sourceId: source.id,
      url: push.url,
      title: push.title,
      summary: push.summary,
      publishedAt: push.publishedAt,
      discoveredAt: now,
      externalId: 'push',
      status,
    })
    .onConflictDoNothing({ target: rawItems.url })
    .returning({ id: rawItems.id })

  // Lost a race with a collection run that found the same link a moment ago.
  if (!inserted) {
    const [row] = await db.select({ id: rawItems.id, status: rawItems.status, sourceId: rawItems.sourceId }).from(rawItems).where(eq(rawItems.url, push.url)).limit(1)
    return knownResult(payload, db, push.url, row)
  }

  let queued: NewsResult['queued'] = { ok: true }
  if (status === 'fresh') {
    try {
      await inngest.send({ name: 'daily/item.fetch-content', data: { itemId: inserted.id } })
    } catch (error) {
      // The judge sweep picks up fresh reports that never got their body.
      queued = { ok: false, error: errorMessage(error) }
    }
  }
  return { kind: 'news', action: 'created', itemId: inserted.id, url: push.url, status, source, queued }
}

async function knownResult(
  payload: Payload,
  db: Awaited<ReturnType<typeof getDb>>['db'],
  url: string,
  row: { id: number; status: 'fresh' | 'archived'; sourceId: number },
): Promise<NewsResult> {
  const [analysis] = await db
    .select({ outcome: itemAnalyses.outcome, outcomeReason: itemAnalyses.outcomeReason })
    .from(itemAnalyses)
    .where(eq(itemAnalyses.itemId, row.id))
    .limit(1)
  const source = await payload.findByID({ collection: 'sources', id: row.sourceId, depth: 0, select: { name: true } }).catch(() => null)
  return {
    kind: 'news',
    action: 'known',
    itemId: row.id,
    url,
    status: row.status,
    source: { id: row.sourceId, name: source?.name ?? `source ${row.sourceId}`, created: false },
    outcome: analysis?.outcome ?? null,
    outcomeReason: analysis?.outcomeReason ?? null,
    story: await storyOf(payload, db, row.id),
  }
}
