import { and, eq, inArray } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'

import { peakOf } from '../heat/rules'
import { refreshDailyCache } from '../review/cache'
import { eventItems, events, rawItems } from '../schema'
import { IMPORT_MEDIA_EVENT, type ImportMediaEvent } from './media'
import { importApprovedAt, importHeatPeak, importLocales, sameMedia, slugCandidates, type ImportStory, type ImportText } from './rules'

type Payload = Awaited<ReturnType<typeof getDb>>['payload']
type Db = Awaited<ReturnType<typeof getDb>>['db']

/** The disabled source the imported reports belong to; never fetched. */
const IMPORT_SOURCE_URL = 'https://ifai.io/import/newscrawler'

export type ImportOutcome = { recordId: string; id: number; slug: string; action: 'created' | 'updated' }
export type ImportFailure = { line: number; recordId: string | null; error: string }

const externalIdOf = (recordId: string) => `feishu:${recordId}`

async function importSourceId(payload: Payload): Promise<number> {
  const found = await payload.find({ collection: 'sources', where: { url: { equals: IMPORT_SOURCE_URL } }, limit: 1, depth: 0 })
  if (found.docs[0]) return found.docs[0].id
  const created = await payload.create({
    collection: 'sources',
    data: {
      name: '本地流水线（飞书导入）',
      type: 'rss',
      tier: 'T1',
      use: 'editorial',
      url: IMPORT_SOURCE_URL,
      intervalMinutes: 180,
      enabled: false,
      notes: 'Reports of the stories imported from the editors’ pipeline (src/modules/daily/import). Never fetched.',
    },
    depth: 0,
  })
  return created.id
}

/**
 * The report and event behind an imported story, found by its Feishu record or made for it: the
 * story's original source as an archived report (its body never fetched), and an event of its
 * own so heat and the outside reach checks work as for any story.
 */
async function reportFor(
  db: Db,
  sourceId: number,
  story: ImportStory,
  now: Date,
): Promise<{ itemId: number; eventId: number; mediaChanged: boolean }> {
  const externalId = externalIdOf(story.recordId)
  const media = story.media?.found ?? null
  const [found] = await db
    .select({ id: rawItems.id, media: rawItems.media })
    .from(rawItems)
    .where(and(eq(rawItems.sourceId, sourceId), eq(rawItems.externalId, externalId)))
    .limit(1)
  let itemId = found?.id
  // The report keeps the pipeline's picture or video, as a collected report keeps its page's:
  // the next import of the same record copies it again only when it changed.
  const mediaChanged = !sameMedia(found?.media, media)
  if (found && mediaChanged) await db.update(rawItems).set({ media }).where(eq(rawItems.id, found.id))
  if (itemId === undefined) {
    const url = story.sources[0].url
    const row = {
      sourceId,
      externalId,
      title: story.text.en.title,
      summary: story.text.en.summary,
      language: 'en',
      publishedAt: new Date(story.publishedAt),
      discoveredAt: now,
      status: 'archived' as const,
      contentStatus: 'skipped' as const,
      media,
    }
    // The site may already hold this address as a report of its own: keep that one apart.
    const [taken] = await db.select({ id: rawItems.id }).from(rawItems).where(eq(rawItems.url, url)).limit(1)
    const [inserted] = await db
      .insert(rawItems)
      .values({ ...row, url: taken ? `${url}#feishu-${story.recordId}` : url })
      .returning({ id: rawItems.id })
    itemId = inserted.id
  }

  const at = new Date(story.publishedAt)
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.representativeItemId, itemId)).limit(1)
  if (event) {
    await db.update(events).set({ title: story.text.en.title, category: story.category, firstSeenAt: at, lastSeenAt: at, updatedAt: now }).where(eq(events.id, event.id))
    return { itemId, eventId: event.id, mediaChanged }
  }
  const [created] = await db
    .insert(events)
    .values({ representativeItemId: itemId, title: story.text.en.title, category: story.category, firstSeenAt: at, lastSeenAt: at })
    .returning({ id: events.id })
  await db.insert(eventItems).values({ eventId: created.id, itemId, relation: 'same', newInformation: true }).onConflictDoNothing()
  return { itemId, eventId: created.id, mediaChanged }
}

/** A free slug for a new story: its own, else with the date appended, else numbered. */
async function freeSlug(payload: Payload, story: ImportStory): Promise<string> {
  for (const slug of slugCandidates(story.slug, story.publishedAt)) {
    const { totalDocs } = await payload.count({ collection: 'stories', where: { slug: { equals: slug } } })
    if (totalDocs === 0) return slug
  }
  return `${story.slug.slice(0, 60)}-${Date.now()}`
}

const localeData = (text: ImportText) => ({ title: text.title, summary: text.summary, tryIt: text.tryIt, body: text.body })

/**
 * Store one story: the same Feishu record updates its story (text, category, tags, companies and
 * products when the line names them, sources, score, time and reach index; its address and status stay), a new one goes on the site at its publish time.
 * Its picture or video is copied afterwards (./media.ts) when it is new or changed; a picture the
 * pipeline no longer sends is taken off. An unchanged one leaves the story's media alone, so an
 * editor's change in the admin stays.
 */
async function importOne(
  payload: Payload,
  db: Db,
  sourceId: number,
  story: ImportStory,
  now: Date,
): Promise<ImportOutcome & { published: boolean; media: ImportMediaEvent['data'] | null }> {
  const { itemId, eventId, mediaChanged } = await reportFor(db, sourceId, story, now)
  const fields = {
    category: story.category,
    tags: story.tags,
    ...(story.entities ? { entities: story.entities } : {}),
    sources: story.sources,
    score: story.score,
    publishedAt: story.publishedAt,
  }
  const existing = await payload.find({
    collection: 'stories',
    where: { representativeItemId: { equals: itemId } },
    limit: 1,
    depth: 0,
    select: { slug: true, status: true, heatPeak: true },
  })
  const found = existing.docs[0]
  // Never lower: the heat job may have seen the story go further than its listed sources.
  const heatPeak = peakOf(found?.heatPeak, importHeatPeak(story.sources, story.publishedAt))
  const dropMedia = found && mediaChanged && !story.media
  const doc = found
    ? await payload.update({
        collection: 'stories',
        id: found.id,
        locale: 'en',
        data: { ...fields, heatPeak, ...localeData(story.text.en), ...(dropMedia ? { media: { kind: 'none' as const, image: null, videoUrl: null, credit: null } } : {}) },
        depth: 0,
      })
    : await payload.create({
        collection: 'stories',
        locale: 'en',
        data: {
          ...fields,
          heatPeak,
          ...localeData(story.text.en),
          slug: await freeSlug(payload, story),
          status: 'published',
          approvedAt: importApprovedAt(story.publishedAt, now),
          eventId,
          representativeItemId: itemId,
        },
        depth: 0,
      })
  for (const locale of importLocales) {
    const text = locale === 'en' ? null : story.text[locale]
    if (text) await payload.update({ collection: 'stories', id: doc.id, locale, data: localeData(text), depth: 0 })
  }
  return {
    recordId: story.recordId,
    id: doc.id,
    slug: doc.slug,
    action: found ? 'updated' : 'created',
    published: doc.status === 'published',
    media: mediaChanged && story.media ? { storyId: doc.id, itemId, credit: story.media.credit } : null,
  }
}

/**
 * Import checked stories one by one; a story that fails is reported and the rest go on. The
 * site's pages are refreshed once at the end, and other modules hear of each story on the site
 * (`daily/story.changed`, as when an editor publishes).
 */
export async function importStories(stories: readonly { line: number; story: ImportStory }[], now = new Date()) {
  const { payload, db } = await getDb()
  const sourceId = await importSourceId(payload)
  const imported: ImportOutcome[] = []
  const failed: ImportFailure[] = []
  const media: ImportMediaEvent[] = []
  let published = 0
  for (const { line, story } of stories) {
    try {
      const outcome = await importOne(payload, db, sourceId, story, now)
      imported.push({ recordId: outcome.recordId, id: outcome.id, slug: outcome.slug, action: outcome.action })
      if (outcome.media) media.push({ name: IMPORT_MEDIA_EVENT, data: outcome.media })
      if (outcome.published) published++
    } catch (error) {
      console.error(`[daily import] record ${story.recordId} failed:`, error)
      failed.push({ line, recordId: story.recordId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (published) {
    await refreshDailyCache()
    try {
      await inngest.send(
        imported.map((outcome) => ({
          name: 'daily/story.changed' as const,
          data: { storyId: outcome.id, change: outcome.action === 'created' ? ('published' as const) : ('corrected' as const) },
        })),
      )
    } catch (error) {
      console.warn('daily/story.changed not sent:', error instanceof Error ? error.message : error)
    }
  }
  // Downloads take seconds each: copied in the background so a batch of 200 answers at once.
  if (media.length) {
    try {
      await inngest.send(media)
    } catch (error) {
      console.warn(`${IMPORT_MEDIA_EVENT} not sent:`, error instanceof Error ? error.message : error)
      // Forget what was sent, so importing the same lines again queues them again.
      await db.update(rawItems).set({ media: null }).where(inArray(rawItems.id, media.map((queued) => queued.data.itemId)))
    }
  }
  return { imported, failed, mediaQueued: media.length }
}
