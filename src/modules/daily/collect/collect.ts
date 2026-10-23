import { and, eq, gte, inArray, sql } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { extractArticle } from '../extract'
import { recordHotSignals } from '../heat/signals'
import { MAX_AGE_MS, triage } from '../intake'
import { rawItems } from '../schema'
import type { FoundItem } from '../types'
import { errorMessage, fetchText, MAX_SOURCE_BYTES, readSource } from './fetch'
import { afterFetch } from './plan'

export type CollectResult = {
  sourceId: number
  name: string
  found: number
  fresh: number
  archived: number
  /** Ids of the fresh rows, whose article bodies are fetched next. */
  freshIds: number[]
  /** For a hot_signal source: links we have whose points, comments or thread were recorded. */
  signals?: number
  error?: string
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * One fetch of one source: read it, keep what is new (triage rules), record the outcome and
 * the next fetch time on the source. A fetch error is stored on the source, never thrown,
 * so the schedule keeps going.
 */
export async function collectSource(sourceId: number): Promise<CollectResult> {
  const { payload, db } = await getDb()
  const source = await payload.findByID({ collection: 'sources', id: sourceId })
  const now = new Date()

  let found: FoundItem[] = []
  let error: string | undefined
  try {
    const { body } = await fetchText(source.url, { maxBytes: MAX_SOURCE_BYTES })
    found = readSource(source, body)
  } catch (cause) {
    error = errorMessage(cause)
  }

  let freshIds: number[] = []
  let archived = 0
  if (!error && found.length) {
    const urls = found.map((item) => item.url)
    const knownRows = await db.select({ url: rawItems.url }).from(rawItems).where(inArray(rawItems.url, urls))
    const { fresh, archive } = triage(found, {
      now,
      known: new Set(knownRows.map((row) => row.url)),
      firstImport: !source.firstFetchedAt,
    })
    const rows = [
      ...fresh.map((item) => toRow(item, sourceId, now, 'fresh')),
      ...archive.map((item) => toRow(item, sourceId, now, 'archived')),
    ]
    if (rows.length) {
      const inserted = await db
        .insert(rawItems)
        .values(rows)
        .onConflictDoNothing({ target: rawItems.url })
        .returning({ id: rawItems.id, status: rawItems.status })
      freshIds = inserted.filter((row) => row.status === 'fresh').map((row) => row.id)
      archived = inserted.length - freshIds.length
    }
  }

  // Popularity evidence counts for links any source found, not only for the new ones (heat rules).
  let signals: number | undefined
  if (!error && source.use === 'hot_signal' && found.length) signals = await recordHotSignals(db, sourceId, found, now)

  const [recent] = await db
    .select({ count: sql<string>`count(*)` })
    .from(rawItems)
    .where(and(eq(rawItems.sourceId, sourceId), gte(rawItems.discoveredAt, new Date(now.getTime() - SEVEN_DAYS_MS))))

  await payload.update({
    collection: 'sources',
    id: sourceId,
    data: afterFetch({ source, now, found: found.length, itemsLast7Days: Number(recent?.count ?? 0), error }),
  })

  return { sourceId, name: source.name, found: found.length, fresh: freshIds.length, archived, freshIds, ...(signals !== undefined && { signals }), error }
}

function toRow(item: FoundItem, sourceId: number, now: Date, status: 'fresh' | 'archived') {
  return {
    sourceId,
    url: item.url,
    title: item.title,
    summary: item.summary ?? null,
    publishedAt: item.publishedAt ?? null,
    discoveredAt: now,
    externalId: item.externalId ?? null,
    discussionUrl: item.discussionUrl ?? null,
    signals: item.signals ?? null,
    status,
  }
}

export type ContentResult = { itemId: number; contentStatus: string; archived?: boolean; error?: string }

/**
 * The article body for one item (Readability), for judging and writing. Also fills in the
 * published time when the source gave none, and archives the item if that time turns out to
 * be more than 48 hours before we found it.
 */
export async function fetchContent(itemId: number): Promise<ContentResult> {
  const { db } = await getDb()
  const [item] = await db.select().from(rawItems).where(eq(rawItems.id, itemId)).limit(1)
  if (!item) return { itemId, contentStatus: 'missing' }
  if (item.contentStatus === 'fetched') return { itemId, contentStatus: 'fetched' }

  const now = new Date()
  try {
    const { body, finalUrl } = await fetchText(item.url)
    const article = extractArticle(body, finalUrl)
    if (!article) {
      await db
        .update(rawItems)
        .set({ contentStatus: 'skipped', contentError: 'No readable article body', contentFetchedAt: now })
        .where(eq(rawItems.id, itemId))
      return { itemId, contentStatus: 'skipped' }
    }

    const publishedAt = item.publishedAt ?? article.publishedAt ?? null
    const tooOld =
      !item.publishedAt && !!publishedAt && item.discoveredAt.getTime() - publishedAt.getTime() > MAX_AGE_MS
    await db
      .update(rawItems)
      .set({
        content: article.text,
        links: article.links,
        summary: item.summary ?? article.excerpt ?? null,
        publishedAt,
        language: article.lang?.slice(0, 2).toLowerCase() || item.language,
        contentStatus: 'fetched',
        contentError: null,
        contentFetchedAt: now,
        ...(tooOld && { status: 'archived' as const }),
      })
      .where(eq(rawItems.id, itemId))
    return { itemId, contentStatus: 'fetched', archived: tooOld }
  } catch (cause) {
    const error = errorMessage(cause)
    await db
      .update(rawItems)
      .set({ contentStatus: 'failed', contentError: error, contentFetchedAt: now })
      .where(eq(rawItems.id, itemId))
    return { itemId, contentStatus: 'failed', error }
  }
}
