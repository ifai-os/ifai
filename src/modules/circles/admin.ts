import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, inArray, isNull, max, or, sql } from '@payloadcms/db-postgres/drizzle'
import { alias } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'
import { cleanName } from '@/modules/apps/reviews/rules'

import { commentCounts } from './data'
import { deleteImages, imageViews, setPostImagesPublic } from './media/images'
import { videoViews } from './media/videos'
import { excerpt, type PostStatus, type ReportReason, type VideoProvider } from './rules'
import { circleCommentReports, circleComments, circleMembers, circlePostReactions, circlePostReports, circlePosts } from './schema'

/**
 * What the back office reads and changes about circles: a circle's posts and comments with their
 * reports, hiding and showing them again, the reports nobody has looked at yet, and clearing out
 * a circle that is deleted. Free of the Payload config, so the collection (through ./endpoints)
 * can import it. The site owner sees a hidden post's pictures too: admins can open any picture.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** How often and why something was reported, and how many of those reports nobody has dealt with. */
export type ReportSummary = { open: number; total: number; reasons: Partial<Record<ReportReason, number>> }

export type AdminPost = {
  id: number
  body: string
  lang: string
  status: PostStatus
  createdAt: string
  author: { name: string; email: string }
  /** People who reacted. */
  reactions: number
  /** Comments and replies readers see. */
  comments: number
  reports: ReportSummary
  images: { square: string; full: string }[]
  video: { provider: VideoProvider; url: string; title: string | null } | null
}

type ReportRow = { id: number; reason: ReportReason; total: number; open: number }

function summarize(rows: ReportRow[], id: number): ReportSummary {
  const mine = rows.filter((row) => row.id === id)
  return {
    open: mine.reduce((sum, row) => sum + row.open, 0),
    total: mine.reduce((sum, row) => sum + Number(row.total), 0),
    reasons: Object.fromEntries(mine.map((row) => [row.reason, Number(row.total)])),
  }
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
  const [reports, people, { byPost }, videos, comments] = await Promise.all([
    db
      .select({
        id: circlePostReports.postId,
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
    commentCounts(payload, ids),
  ])
  const reacted = new Map(people.map((row) => [row.postId, row.people]))

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    lang: row.lang,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    author: { name: cleanName(row.name), email: row.email },
    reactions: reacted.get(row.id) ?? 0,
    comments: comments.get(row.id) ?? 0,
    reports: summarize(reports, row.id),
    images: (byPost.get(row.id) ?? []).map((image) => ({ square: image.square, full: image.full })),
    video: row.videoId && videos.has(row.videoId) ? pickVideo(videos.get(row.videoId)!) : null,
  }))
}

/** The comment a reply is listed under. */
const parentComment = alias(circleComments, 'parent_comment')

export type AdminComment = {
  id: number
  /** The post it is under, by its first words; the page's link is made from the id. */
  post: { id: number; excerpt: string }
  /** It is a reply, listed under another comment. */
  reply: boolean
  /** A reply under a hidden comment: readers do not see it either. */
  underHidden: boolean
  body: string
  lang: string
  status: PostStatus
  createdAt: string
  author: { name: string; email: string }
  reports: ReportSummary
}

/** A circle's latest comments and replies, shown and hidden, newest first, with how often and why each was reported. */
export async function adminComments(payload: Payload, circleId: number, limit = 200): Promise<AdminComment[]> {
  const db = drizzleOf(payload)
  const rows = await db
    .select({
      id: circleComments.id,
      postId: circleComments.postId,
      parentId: circleComments.parentId,
      parentStatus: parentComment.status,
      body: circleComments.body,
      lang: circleComments.lang,
      status: circleComments.status,
      createdAt: circleComments.createdAt,
      postBody: circlePosts.body,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(circleComments)
    .innerJoin(circlePosts, eq(circlePosts.id, circleComments.postId))
    .innerJoin(authUsers, eq(authUsers.id, circleComments.userId))
    .leftJoin(parentComment, eq(parentComment.id, circleComments.parentId))
    .where(eq(circlePosts.circleId, circleId))
    .orderBy(desc(circleComments.id))
    .limit(limit)
  if (rows.length === 0) return []

  const reports = await db
    .select({
      id: circleCommentReports.commentId,
      reason: circleCommentReports.reason,
      total: count(),
      open: sql<number>`count(*) filter (where ${circleCommentReports.resolvedAt} is null)`.mapWith(Number),
    })
    .from(circleCommentReports)
    .where(
      inArray(
        circleCommentReports.commentId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(circleCommentReports.commentId, circleCommentReports.reason)

  return rows.map((row) => ({
    id: row.id,
    post: { id: row.postId, excerpt: excerpt(row.postBody, 30) },
    reply: row.parentId !== null,
    underHidden: row.parentStatus === 'hidden',
    body: row.body,
    lang: row.lang,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    author: { name: cleanName(row.name), email: row.email },
    reports: summarize(reports, row.id),
  }))
}

const pickVideo = ({ provider, url, title }: { provider: VideoProvider; url: string; title: string | null }) => ({ provider, url, title })

/** Marks a post's open reports as dealt with. */
async function resolveReports(payload: Payload, postId: number, now: Date): Promise<void> {
  await drizzleOf(payload)
    .update(circlePostReports)
    .set({ resolvedAt: now })
    .where(and(eq(circlePostReports.postId, postId), isNull(circlePostReports.resolvedAt)))
}

/** Marks a comment's open reports as dealt with. */
async function resolveCommentReports(payload: Payload, commentId: number, now: Date): Promise<void> {
  await drizzleOf(payload)
    .update(circleCommentReports)
    .set({ resolvedAt: now })
    .where(and(eq(circleCommentReports.commentId, commentId), isNull(circleCommentReports.resolvedAt)))
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

/**
 * Hides a comment in the circle (the replies under it go out of sight with it) or shows it
 * again; or, with `keep`, leaves it as it is and closes its reports. Hiding closes them too.
 * False when no post in the circle has such a comment.
 */
export async function moderateComment(
  payload: Payload,
  circleId: number,
  commentId: number,
  change: { status: PostStatus } | { keep: true },
  now = new Date(),
): Promise<boolean> {
  const db = drizzleOf(payload)
  const where = and(
    eq(circleComments.id, commentId),
    inArray(circleComments.postId, db.select({ id: circlePosts.id }).from(circlePosts).where(eq(circlePosts.circleId, circleId))),
  )
  if ('status' in change) {
    const updated = await db.update(circleComments).set({ status: change.status }).where(where).returning({ id: circleComments.id })
    if (updated.length === 0) return false
    if (change.status === 'hidden') await resolveCommentReports(payload, commentId, now)
    return true
  }
  const [comment] = await db.select({ id: circleComments.id }).from(circleComments).where(where).limit(1)
  if (!comment) return false
  await resolveCommentReports(payload, commentId, now)
  return true
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

  const names = await circleNames(payload, rows)
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

export type OpenCommentReport = OpenPostReport & { commentId: number }

/**
 * Comments readers see (shown, on a shown post, and a reply only while the comment it is under
 * is shown) with reports nobody has dealt with, most recently reported first.
 */
export async function openCommentReports(payload: Payload, limit = 10): Promise<{ total: number; items: OpenCommentReport[] }> {
  const db = drizzleOf(payload)
  const open = and(
    isNull(circleCommentReports.resolvedAt),
    eq(circleComments.status, 'shown'),
    eq(circlePosts.status, 'shown'),
    or(isNull(circleComments.parentId), eq(parentComment.status, 'shown')),
  )
  const [rows, [total]] = await Promise.all([
    db
      .select({
        commentId: circleCommentReports.commentId,
        postId: circleComments.postId,
        circleId: circlePosts.circleId,
        body: circleComments.body,
        reports: count(),
        lastReportedAt: max(circleCommentReports.createdAt),
      })
      .from(circleCommentReports)
      .innerJoin(circleComments, eq(circleComments.id, circleCommentReports.commentId))
      .innerJoin(circlePosts, eq(circlePosts.id, circleComments.postId))
      .leftJoin(parentComment, eq(parentComment.id, circleComments.parentId))
      .where(open)
      .groupBy(circleCommentReports.commentId, circleComments.postId, circlePosts.circleId, circleComments.body)
      .orderBy(desc(max(circleCommentReports.createdAt)))
      .limit(limit),
    db
      .select({ count: sql<number>`count(distinct ${circleCommentReports.commentId})`.mapWith(Number) })
      .from(circleCommentReports)
      .innerJoin(circleComments, eq(circleComments.id, circleCommentReports.commentId))
      .innerJoin(circlePosts, eq(circlePosts.id, circleComments.postId))
      .leftJoin(parentComment, eq(parentComment.id, circleComments.parentId))
      .where(open),
  ])
  if (rows.length === 0) return { total: 0, items: [] }

  const names = await circleNames(payload, rows)
  return {
    total: total?.count ?? rows.length,
    items: rows.map((row) => ({
      commentId: row.commentId,
      postId: row.postId,
      circleId: row.circleId,
      circleName: names.get(row.circleId) ?? `#${row.circleId}`,
      excerpt: excerpt(row.body),
      reports: Number(row.reports),
      lastReportedAt: (row.lastReportedAt ?? new Date(0)).toISOString(),
    })),
  }
}

/** The circles' names in the back office's own language, for the notice above the list. */
async function circleNames(payload: Payload, rows: { circleId: number }[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((row) => row.circleId))]
  const { docs } = await payload.find({
    collection: 'circles',
    where: { id: { in: ids } },
    select: { name: true },
    depth: 0,
    limit: ids.length,
    pagination: false,
  })
  return new Map(docs.map((doc) => [doc.id, doc.name]))
}

/** A deleted circle takes its posts (with their reactions, reports, comments and pictures) and its members with it. */
export async function deleteCircleData(payload: Payload, circleId: number): Promise<void> {
  const db = drizzleOf(payload)
  await db.delete(circlePosts).where(eq(circlePosts.circleId, circleId))
  await db.delete(circleMembers).where(eq(circleMembers.circleId, circleId))
  await deleteImages(payload, { circle: { equals: circleId } })
}
