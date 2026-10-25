import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, inArray, isNull, max, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'
import { cleanName } from '@/modules/apps/reviews/rules'

import { deleteImages, imageViews, setPostImagesPublic } from './media/images'
import { videoViews } from './media/videos'
import type { PostStatus, ReportReason, VideoProvider } from './rules'
import { circleMembers, circlePostReactions, circlePostReports, circlePosts } from './schema'

/**
 * What the back office reads and changes about circles: a circle's posts with their reports,
 * hiding and showing them again, the reports nobody has looked at yet, and clearing out a circle
 * that is deleted. Free of the Payload config, so the collection (through ./endpoints) can import it.
 * The site owner sees a hidden post's pictures too: admins can open any picture.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export type AdminPost = {
  id: number
  body: string
  lang: string
  status: PostStatus
  createdAt: string
  author: { name: string; email: string }
  /** People who reacted. */
  reactions: number
  reports: { open: number; total: number; reasons: Partial<Record<ReportReason, number>> }
  images: { square: string; full: string }[]
  video: { provider: VideoProvider; url: string; title: string | null } | null
}

/** A circle's posts, shown and hidden, newest first, with how often and why each was reported. */
export async function adminPosts(payload: Payload, circleId: number, limit = 200): Promise<AdminPost[]> {
  const db = drizzleOf(payload)
  const rows = await db
    .select({
      id: circlePosts.id,
      body: circlePosts.body,
      lang: circlePosts.lang,
      status: circlePosts.status,
      videoId: circlePosts.videoId,
      createdAt: circlePosts.createdAt,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(circlePosts)
    .innerJoin(authUsers, eq(authUsers.id, circlePosts.userId))
    .where(eq(circlePosts.circleId, circleId))
    .orderBy(desc(circlePosts.id))
    .limit(limit)
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const [reports, people, { byPost }, videos] = await Promise.all([
    db
      .select({
        postId: circlePostReports.postId,
        reason: circlePostReports.reason,
        total: count(),
        open: sql<number>`count(*) filter (where ${circlePostReports.resolvedAt} is null)`.mapWith(Number),
      })
      .from(circlePostReports)
      .where(inArray(circlePostReports.postId, ids))
      .groupBy(circlePostReports.postId, circlePostReports.reason),
    db
      .select({
        postId: circlePostReactions.postId,
        people: sql<number>`count(distinct ${circlePostReactions.userId})`.mapWith(Number),
      })
      .from(circlePostReactions)
      .where(inArray(circlePostReactions.postId, ids))
      .groupBy(circlePostReactions.postId),
    imageViews(payload, { postIds: ids, coverIds: [] }),
    videoViews(payload, [...new Set(rows.flatMap((row) => (row.videoId ? [row.videoId] : [])))]),
  ])
  const reacted = new Map(people.map((row) => [row.postId, row.people]))

  return rows.map((row) => {
    const mine = reports.filter((report) => report.postId === row.id)
    return {
      id: row.id,
      body: row.body,
      lang: row.lang,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      author: { name: cleanName(row.name), email: row.email },
      reactions: reacted.get(row.id) ?? 0,
      reports: {
        open: mine.reduce((sum, report) => sum + report.open, 0),
        total: mine.reduce((sum, report) => sum + Number(report.total), 0),
        reasons: Object.fromEntries(mine.map((report) => [report.reason, Number(report.total)])),
      },
      images: (byPost.get(row.id) ?? []).map((image) => ({ square: image.square, full: image.full })),
      video: row.videoId && videos.has(row.videoId) ? pickVideo(videos.get(row.videoId)!) : null,
    }
  })
}

const pickVideo = ({ provider, url, title }: { provider: VideoProvider; url: string; title: string | null }) => ({ provider, url, title })

/** Marks a post's open reports as dealt with. */
async function resolveReports(payload: Payload, postId: number, now: Date): Promise<void> {
  await drizzleOf(payload)
    .update(circlePostReports)
    .set({ resolvedAt: now })
    .where(and(eq(circlePostReports.postId, postId), isNull(circlePostReports.resolvedAt)))
}

/**
 * Hides a post in the circle, or shows it again, its pictures with it; or, with `keep`, leaves it
 * as it is and closes its reports. Hiding closes them too. False when the circle has no such post.
 */
export async function moderatePost(
  payload: Payload,
  circleId: number,
  postId: number,
  change: { status: PostStatus } | { keep: true },
  now = new Date(),
): Promise<boolean> {
  const db = drizzleOf(payload)
  const where = and(eq(circlePosts.id, postId), eq(circlePosts.circleId, circleId))
  if ('status' in change) {
    const updated = await db.update(circlePosts).set({ status: change.status }).where(where).returning({ id: circlePosts.id })
    if (updated.length === 0) return false
    await setPostImagesPublic(payload, postId, change.status === 'shown')
    if (change.status === 'hidden') await resolveReports(payload, postId, now)
    return true
  }
  const [post] = await db.select({ id: circlePosts.id }).from(circlePosts).where(where).limit(1)
  if (!post) return false
  await resolveReports(payload, postId, now)
  return true
}

function excerpt(body: string, length = 60): string {
  const characters = [...body.replace(/\s+/gu, ' ')]
  return characters.length > length ? `${characters.slice(0, length).join('')}…` : characters.join('')
}

export type OpenPostReport = {
  postId: number
  circleId: number
  circleName: string
  /** The post's first words. */
  excerpt: string
  reports: number
  lastReportedAt: string
}

/** Shown posts with reports nobody has dealt with, most recently reported first. */
export async function openPostReports(payload: Payload, limit = 10): Promise<{ total: number; items: OpenPostReport[] }> {
  const db = drizzleOf(payload)
  const open = and(isNull(circlePostReports.resolvedAt), eq(circlePosts.status, 'shown'))
  const [rows, [total]] = await Promise.all([
    db
      .select({
        postId: circlePostReports.postId,
        circleId: circlePosts.circleId,
        body: circlePosts.body,
        reports: count(),
        lastReportedAt: max(circlePostReports.createdAt),
      })
      .from(circlePostReports)
      .innerJoin(circlePosts, eq(circlePosts.id, circlePostReports.postId))
      .where(open)
      .groupBy(circlePostReports.postId, circlePosts.circleId, circlePosts.body)
      .orderBy(desc(max(circlePostReports.createdAt)))
      .limit(limit),
    db
      .select({ count: sql<number>`count(distinct ${circlePostReports.postId})`.mapWith(Number) })
      .from(circlePostReports)
      .innerJoin(circlePosts, eq(circlePosts.id, circlePostReports.postId))
      .where(open),
  ])
  if (rows.length === 0) return { total: 0, items: [] }

  const { docs } = await payload.find({
    collection: 'circles',
    where: { id: { in: [...new Set(rows.map((row) => row.circleId))] } },
    select: { name: true },
    depth: 0,
    limit: rows.length,
    pagination: false,
  })
  const names = new Map(docs.map((doc) => [doc.id, doc.name]))
  return {
    total: total?.count ?? rows.length,
    items: rows.map((row) => ({
      postId: row.postId,
      circleId: row.circleId,
      circleName: names.get(row.circleId) ?? `#${row.circleId}`,
      excerpt: excerpt(row.body),
      reports: Number(row.reports),
      lastReportedAt: (row.lastReportedAt ?? new Date(0)).toISOString(),
    })),
  }
}

/** A deleted circle takes its posts (with their reactions, reports and pictures) and its members with it. */
export async function deleteCircleData(payload: Payload, circleId: number): Promise<void> {
  const db = drizzleOf(payload)
  await db.delete(circlePosts).where(eq(circlePosts.circleId, circleId))
  await db.delete(circleMembers).where(eq(circleMembers.circleId, circleId))
  await deleteImages(payload, { circle: { equals: circleId } })
}
