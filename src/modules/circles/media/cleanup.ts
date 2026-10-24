import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, eq, lt, notExists, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { circlePosts, circleVideos } from '../schema'
import { deleteImages } from './images'

/**
 * The hourly sweep (docs/specs/circles.md「定时任务与 AI」): pictures uploaded a day ago and never
 * posted, pictures and covers nothing points at any more, and videos pasted over a week ago that
 * no post uses now. Deleting through Payload deletes the files too.
 */

const hourMs = 60 * 60 * 1000
const batch = 500

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export async function cleanUpCircleMedia(payload: Payload, now = new Date()): Promise<{ unposted: number; orphaned: number; videos: number }> {
  const dayAgo = new Date(now.getTime() - 24 * hourMs)
  const weekAgo = new Date(now.getTime() - 7 * 24 * hourMs)
  const db = drizzleOf(payload)

  const unposted = await payload.delete({
    collection: 'circle-images',
    where: { kind: { equals: 'post' }, post: { exists: false }, createdAt: { less_than: dayAgo.toISOString() } },
    overrideAccess: true,
  })

  const videos = await db
    .delete(circleVideos)
    .where(
      and(
        lt(circleVideos.createdAt, weekAgo),
        notExists(db.select({ id: circlePosts.id }).from(circlePosts).where(eq(circlePosts.videoId, circleVideos.id))),
      ),
    )
    .returning({ coverId: circleVideos.coverId })

  // `circle_images` is the collection's own table (Payload names it after the slug). A post's
  // pictures whose post is gone, and covers no video has, a day after they were made.
  const orphans = (await db.execute(sql`
    select ci.id from circle_images ci
    where (ci.kind = 'post' and ci.post is not null and not exists (select 1 from ${circlePosts} p where p.id = ci.post))
       or (ci.kind = 'cover' and ci.created_at < ${dayAgo.toISOString()}::timestamptz
           and not exists (select 1 from ${circleVideos} v where v.cover_id = ci.id))
    limit ${batch}`)) as { rows: { id: number }[] }
  const orphanIds = orphans.rows.map((row) => Number(row.id))
  const coverIds = videos.flatMap((video) => (video.coverId ? [video.coverId] : []))
  const gone = [...new Set([...orphanIds, ...coverIds])]
  if (gone.length > 0) await deleteImages(payload, { id: { in: gone } })

  return { unposted: unposted.docs.length, orphaned: orphanIds.length, videos: videos.length }
}
