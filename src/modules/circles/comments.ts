import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import { alias } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import { authUsers } from '@/lib/auth/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { cleanName } from '@/modules/apps/reviews/rules'
import { blockedAmong, notBlocked } from '@/modules/profiles/blocks'

import { commentCounts, shownPost } from './data'
import { commentRules, type AuthorView, type CommentThread, type CommentView, type PersonView, type PostStatus, type ReportReason } from './rules'
import { circleCommentReports, circleComments } from './schema'

/**
 * Comments on posts (docs/specs/circles.md rule 15) for the post's page and src/app/api/circles/comments:
 * one level of replies, newest comments first and their replies oldest first. Like ./data.ts it
 * works on the Payload instance it is given. A reader sees shown comments and their own hidden
 * ones; a hidden comment takes the replies under it out of sight, except for its own author.
 * Only a shown post in a circle readers can see has comments to read or write. A member and
 * someone they blocked or were blocked by see none of each other's comments, nor the replies under
 * them, and cannot comment on each other's posts or reply to each other (rule 23).
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

const person = (userId: string, name: string): PersonView => ({ name: cleanName(name), tone: toneFor(userId) })

const author = (userId: string, name: string, handle: string | null): AuthorView => ({ ...person(userId, name), handle })

const answered = alias(circleComments, 'answered_comment')
const answeredAuthor = alias(authUsers, 'answered_author')
const parentComment = alias(circleComments, 'parent_comment')

const commentColumns = {
  id: circleComments.id,
  postId: circleComments.postId,
  parentId: circleComments.parentId,
  userId: circleComments.userId,
  body: circleComments.body,
  lang: circleComments.lang,
  status: circleComments.status,
  createdAt: circleComments.createdAt,
  name: authUsers.name,
  handle: authUsers.handle,
  answeredUserId: answered.userId,
  answeredName: answeredAuthor.name,
}

type CommentRow = {
  id: number
  postId: number
  parentId: number | null
  userId: string
  body: string
  lang: string
  status: PostStatus
  createdAt: Date
  name: string
  handle: string | null
  answeredUserId: string | null
  answeredName: string | null
}

/** Comments with their authors and, for a reply that answers another reply, whom it answers. */
function selectComments(payload: Payload) {
  return drizzleOf(payload)
    .select(commentColumns)
    .from(circleComments)
    .innerJoin(authUsers, eq(authUsers.id, circleComments.userId))
    .leftJoin(answered, eq(answered.id, circleComments.replyToId))
    .leftJoin(answeredAuthor, eq(answeredAuthor.id, answered.userId))
}

/** Shown comments, and the reader's own hidden ones; none by someone they blocked or were blocked by. */
function seenBy(userId: string | null): SQL | undefined {
  const shown = eq(circleComments.status, 'shown')
  return userId ? and(or(shown, eq(circleComments.userId, userId)), notBlocked(circleComments.userId, userId)) : shown
}

function toView(row: CommentRow, userId: string | null): CommentView {
  return {
    id: row.id,
    post: row.postId,
    parent: row.parentId,
    replyTo: row.answeredUserId !== null && row.answeredName !== null ? person(row.answeredUserId, row.answeredName) : null,
    body: row.body,
    lang: row.lang,
    author: author(row.userId, row.name, row.handle),
    mine: row.userId === userId,
    hidden: row.status === 'hidden',
    createdAt: row.createdAt.toISOString(),
  }
}

async function countFor(payload: Payload, postId: number, readerId: string | null): Promise<number> {
  return (await commentCounts(payload, [postId], readerId)).get(postId) ?? 0
}

export type CommentsQuery = {
  postId: number
  /** The circles readers can see. */
  circleIds: number[]
  userId: string | null
  /** The last comment of the page before: the next page is older. */
  cursor: number | null
}

/**
 * One page of a post's comments, newest first, each with its first few replies and how many the
 * reader can see in all; null when readers cannot see the post (or it is hidden).
 */
export async function commentsPage(
  payload: Payload,
  { postId, circleIds, userId, cursor }: CommentsQuery,
): Promise<{ count: number; comments: CommentThread[]; next: number | null } | null> {
  if (!(await shownPost(payload, postId, circleIds, userId))) return null
  const db = drizzleOf(payload)
  const size = commentRules.pageSize
  const rows = await selectComments(payload)
    .where(and(eq(circleComments.postId, postId), isNull(circleComments.parentId), seenBy(userId), cursor ? lt(circleComments.id, cursor) : undefined))
    .orderBy(desc(circleComments.id))
    .limit(size + 1)
  const page = rows.slice(0, size)
  const threadIds = page.map((row) => row.id)

  let replies: CommentRow[] = []
  let replyCounts = new Map<number, number>()
  if (threadIds.length > 0) {
    const inThreads = and(inArray(circleComments.parentId, threadIds), seenBy(userId))
    const ranked = db
      .select({
        id: circleComments.id,
        place: sql<number>`row_number() over (partition by ${circleComments.parentId} order by ${circleComments.id})`.as('place'),
      })
      .from(circleComments)
      .where(inThreads)
      .as('ranked')
    const [first, counted] = await Promise.all([
      selectComments(payload)
        .innerJoin(ranked, eq(ranked.id, circleComments.id))
        .where(lte(ranked.place, commentRules.repliesShown))
        .orderBy(asc(circleComments.id)),
      db.select({ parentId: circleComments.parentId, count: count() }).from(circleComments).where(inThreads).groupBy(circleComments.parentId),
    ])
    replies = first
    replyCounts = new Map(counted.map((row) => [row.parentId ?? 0, Number(row.count)]))
  }

  const comments = page.map((row) => ({
    ...toView(row, userId),
    replies: replies.filter((reply) => reply.parentId === row.id).map((reply) => toView(reply, userId)),
    replyCount: replyCounts.get(row.id) ?? 0,
  }))
  return { count: await countFor(payload, postId, userId), comments, next: rows.length > size ? page[page.length - 1].id : null }
}

/**
 * The replies under one of the post's comments after `cursor`, oldest first; null when the reader
 * cannot see the post or that comment.
 */
export async function threadReplies(
  payload: Payload,
  { postId, threadId, circleIds, userId, cursor }: CommentsQuery & { threadId: number },
): Promise<{ replies: CommentView[]; next: number | null } | null> {
  if (!(await shownPost(payload, postId, circleIds, userId))) return null
  const db = drizzleOf(payload)
  const [thread] = await db
    .select({ id: circleComments.id })
    .from(circleComments)
    .where(and(eq(circleComments.id, threadId), eq(circleComments.postId, postId), isNull(circleComments.parentId), seenBy(userId)))
    .limit(1)
  if (!thread) return null
  const size = commentRules.repliesPageSize
  const rows = await selectComments(payload)
    .where(and(eq(circleComments.parentId, threadId), seenBy(userId), cursor ? gt(circleComments.id, cursor) : undefined))
    .orderBy(asc(circleComments.id))
    .limit(size + 1)
  const page = rows.slice(0, size)
  return { replies: page.map((row) => toView(row, userId)), next: rows.length > size ? page[page.length - 1].id : null }
}

/** A comment everyone can see on this post: shown, and not under a hidden one; with the author of the comment it is under. */
async function publicComment(
  payload: Payload,
  commentId: number,
  postId?: number,
): Promise<{ id: number; postId: number; parentId: number | null; userId: string; parentUserId: string | null } | null> {
  const [comment] = await drizzleOf(payload)
    .select({
      id: circleComments.id,
      postId: circleComments.postId,
      parentId: circleComments.parentId,
      userId: circleComments.userId,
      parentUserId: parentComment.userId,
    })
    .from(circleComments)
    .leftJoin(parentComment, eq(parentComment.id, circleComments.parentId))
    .where(
      and(
        eq(circleComments.id, commentId),
        postId === undefined ? undefined : eq(circleComments.postId, postId),
        eq(circleComments.status, 'shown'),
        or(isNull(circleComments.parentId), eq(parentComment.status, 'shown')),
      ),
    )
    .limit(1)
  return comment ?? null
}

export type CreateCommentResult =
  | { status: 'created'; comment: CommentView; count: number }
  | { status: 'not-found' | 'invalid-reply' | 'daily-limit' }

/**
 * Publishes the member's comment on a post readers can see, or their reply: answering a comment
 * puts the reply under it, answering a reply puts it under the same comment and names whom it
 * answers. At most `dailyComments` a Shanghai day; one they deleted no longer counts. Not on the
 * post of someone they blocked or were blocked by, nor in reply to them or under their comment.
 */
export async function createComment(
  payload: Payload,
  comment: { postId: number; userId: string; body: string; lang: string; replyTo: number | null },
  circleIds: number[],
  now = new Date(),
): Promise<CreateCommentResult> {
  const { postId, userId, body, lang, replyTo } = comment
  if (!(await shownPost(payload, postId, circleIds, userId))) return { status: 'not-found' }
  const db = drizzleOf(payload)
  const [today] = await db
    .select({ count: count() })
    .from(circleComments)
    .where(and(eq(circleComments.userId, userId), gte(circleComments.createdAt, shanghaiDayStart(now))))
  if (Number(today?.count ?? 0) >= commentRules.dailyComments) return { status: 'daily-limit' }

  let parentId: number | null = null
  let replyToId: number | null = null
  if (replyTo !== null) {
    const target = await publicComment(payload, replyTo, postId)
    if (!target) return { status: 'invalid-reply' }
    const people = target.parentUserId === null ? [target.userId] : [target.userId, target.parentUserId]
    if ((await blockedAmong(payload, userId, people)).size > 0) return { status: 'invalid-reply' }
    parentId = target.parentId ?? target.id
    replyToId = target.parentId === null ? null : target.id
  }
  const [created] = await db.insert(circleComments).values({ postId, userId, parentId, replyToId, body, lang }).returning({ id: circleComments.id })
  const [row] = await selectComments(payload).where(eq(circleComments.id, created.id)).limit(1)
  return { status: 'created', comment: toView(row, userId), count: await countFor(payload, postId, userId) }
}

/**
 * Deletes the member's own comment with the replies under it and the reports on them; the post's
 * count after it, or null when they have no such comment.
 */
export async function deleteComment(payload: Payload, commentId: number, userId: string): Promise<{ postId: number; count: number } | null> {
  const [deleted] = await drizzleOf(payload)
    .delete(circleComments)
    .where(and(eq(circleComments.id, commentId), eq(circleComments.userId, userId)))
    .returning({ postId: circleComments.postId })
  if (!deleted) return null
  return { postId: deleted.postId, count: await countFor(payload, deleted.postId, userId) }
}

export type CommentReportResult = 'reported' | 'not-found' | 'own-comment'

/** Records a reader's report of a comment everyone can see, once per reporter. */
export async function reportComment(
  payload: Payload,
  report: { commentId: number; reason: ReportReason; reporter: string; userId: string | null },
  circleIds: number[],
): Promise<CommentReportResult> {
  const comment = await publicComment(payload, report.commentId)
  if (!comment || !(await shownPost(payload, comment.postId, circleIds))) return 'not-found'
  if (comment.userId === report.userId) return 'own-comment'
  await drizzleOf(payload)
    .insert(circleCommentReports)
    .values({ commentId: report.commentId, reporter: report.reporter, reason: report.reason })
    .onConflictDoNothing()
  return 'reported'
}
