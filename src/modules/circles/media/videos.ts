import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, eq, gte, inArray } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { shanghaiDayStart } from '@/lib/shanghai-day'
import type { FetchDeps } from '@/modules/apps/profile/fetch'

import { mediaRules, type VideoView } from '../rules'
import { circleVideos } from '../schema'
import { deleteImages, imageViews, saveCover } from './images'
import { embedUrl, parseVideoLink, type VideoLink } from './links'
import { followShortLink, readVideoInfo, type VideoInfoDeps } from './video-info'

/**
 * Video links (docs/specs/circles.md rule 13): read once when someone pastes one, shared by the
 * posts that link it. A link nothing could be read about is tried again after an hour.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

const retryAfterMs = 60 * 60 * 1000

type VideoRow = typeof circleVideos.$inferSelect

export type LookUpResult = { status: 'ok'; video: VideoView } | { status: 'unsupported' } | { status: 'daily-limit' }

/** The cards for these videos, by id; covers come from `circle-images`. */
export async function videoViews(payload: Payload, ids: number[]): Promise<Map<number, VideoView>> {
  const result = new Map<number, VideoView>()
  if (ids.length === 0) return result
  const rows = await drizzleOf(payload).select().from(circleVideos).where(inArray(circleVideos.id, ids))
  const { covers } = await imageViews(payload, {
    postIds: [],
    coverIds: rows.flatMap((row) => (row.coverId ? [row.coverId] : [])),
  })
  for (const row of rows) result.set(row.id, toView(row, row.coverId ? (covers.get(row.coverId) ?? null) : null))
  return result
}

function toView(row: VideoRow, cover: string | null): VideoView {
  const found = row.found && Boolean(row.title)
  return {
    id: row.id,
    provider: row.provider,
    url: row.url,
    embed: embedUrl(row.provider, row.videoKey),
    title: found ? row.title : null,
    channel: found ? row.channel : null,
    duration: found ? row.durationSeconds : null,
    cover: found ? cover : null,
  }
}

async function find(payload: Payload, link: VideoLink): Promise<VideoRow | undefined> {
  const [row] = await drizzleOf(payload)
    .select()
    .from(circleVideos)
    .where(and(eq(circleVideos.provider, link.provider), eq(circleVideos.videoKey, link.key)))
    .limit(1)
  return row
}

/**
 * The card for a pasted address: a video already known is answered from the table; a new one is
 * read from its site and its cover kept, at most `dailyVideos` new ones per member a day.
 */
export async function lookUpVideo(
  payload: Payload,
  input: string,
  userId: string,
  { now = new Date(), deps = {} }: { now?: Date; deps?: VideoInfoDeps & FetchDeps } = {},
): Promise<LookUpResult> {
  const parsed = parseVideoLink(input)
  const link = parsed && 'short' in parsed ? await followShortLink(parsed, deps) : parsed
  if (!link) return { status: 'unsupported' }

  const known = await find(payload, link)
  if (known && (known.found || now.getTime() - known.fetchedAt.getTime() < retryAfterMs)) {
    return { status: 'ok', video: (await videoViews(payload, [known.id])).get(known.id)! }
  }
  if (!known) {
    const [today] = await drizzleOf(payload)
      .select({ count: count() })
      .from(circleVideos)
      .where(and(eq(circleVideos.requestedBy, userId), gte(circleVideos.createdAt, shanghaiDayStart(now))))
    if (Number(today?.count ?? 0) >= mediaRules.dailyVideos) return { status: 'daily-limit' }
  }

  const info = await readVideoInfo(link, deps)
  const coverId = info ? await saveCover(payload, info.covers, deps) : null
  const values = {
    title: info?.title ?? null,
    channel: info?.channel ?? null,
    durationSeconds: info?.duration ?? null,
    coverId,
    found: Boolean(info),
    fetchedAt: now,
  }
  const db = drizzleOf(payload)
  let id: number
  if (known) {
    await db.update(circleVideos).set(values).where(eq(circleVideos.id, known.id))
    if (known.coverId && known.coverId !== coverId) await deleteImages(payload, { id: { equals: known.coverId } })
    id = known.id
  } else {
    const [created] = await db
      .insert(circleVideos)
      .values({ provider: link.provider, videoKey: link.key, url: link.url, requestedBy: userId, ...values })
      .onConflictDoNothing()
      .returning({ id: circleVideos.id })
    if (created) id = created.id
    else {
      // Someone pasted the same video at the same moment: theirs is kept, this cover is not needed.
      if (coverId) await deleteImages(payload, { id: { equals: coverId } })
      id = (await find(payload, link))!.id
    }
  }
  return { status: 'ok', video: (await videoViews(payload, [id])).get(id)! }
}

/** True when the video can go in a post. */
export async function videoExists(payload: Payload, id: number): Promise<boolean> {
  const [row] = await drizzleOf(payload).select({ id: circleVideos.id }).from(circleVideos).where(eq(circleVideos.id, id)).limit(1)
  return Boolean(row)
}
