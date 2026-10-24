import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, countDistinct, desc, eq, gte, inArray, isNull, lt, ne, or, sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import { alias } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import { authUsers } from '@/lib/auth/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { cleanName } from '@/modules/apps/reviews/rules'

import {
  circleRules,
  hotCircleIds,
  sortReactions,
  type CirclesOverview,
  type FeedTab,
  type PersonView,
  type PostStatus,
  type PostView,
  type Reaction,
  type ReactionView,
  type ReportReason,
} from './rules'
import { attachImages, claimable, deleteImages, imageViews } from './media/images'
import { videoExists, videoViews } from './media/videos'
import { circleComments, circleMembers, circlePostReactions, circlePostReports, circlePosts } from './schema'

/**
 * Reading and writing circles for the page (src/app/api/circles). Works on the Payload instance it
 * is given and stays free of the Payload config, like the back office's ./admin. Which circles
 * readers can see comes from the caller (./public.ts reads the `circles` collection): posts in a
 * hidden circle are left out everywhere.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

const person = (userId: string, name: string): PersonView => ({ name: cleanName(name), tone: toneFor(userId) })

/** Everyone's shown posts, and the reader's own hidden ones, in the circles readers can see. */
function readable(circleIds: number[], userId: string | null): SQL | undefined {
  const visible = eq(circlePosts.status, 'shown')
  return and(inArray(circlePosts.circleId, circleIds), userId ? or(visible, eq(circlePosts.userId, userId)) : visible)
}

/**
 * The numbers on the circles' cards and in the header: members, posts today (Shanghai day), the
 * last few people who posted, the busiest two circles, and how many people posted today.
 * Hidden posts do not count.
 */
export async function circlesOverview(payload: Payload, circleIds: number[], now = new Date()): Promise<CirclesOverview> {
  if (circleIds.length === 0) return { postersToday: 0, circles: [] }
  const db = drizzleOf(payload)
  const dayStart = shanghaiDayStart(now)
  const today = and(inArray(circlePosts.circleId, circleIds), eq(circlePosts.status, 'shown'), gte(circlePosts.createdAt, dayStart))
  // The last people to post in each circle in the past 30 days, newest first.
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recentPosters = sql`
    select circle_id, user_id, name from (
      select ${circlePosts.circleId} as circle_id, ${circlePosts.userId} as user_id, ${authUsers.name} as name,
        row_number() over (partition by ${circlePosts.circleId} order by max(${circlePosts.id}) desc) as place
      from ${circlePosts} inner join ${authUsers} on ${authUsers.id} = ${circlePosts.userId}
      where ${and(inArray(circlePosts.circleId, circleIds), eq(circlePosts.status, 'shown'), gte(circlePosts.createdAt, since))}
      group by ${circlePosts.circleId}, ${circlePosts.userId}, ${authUsers.name}
    ) as recent
    where place <= ${circleRules.recentPosters}
    order by circle_id, place`

  const [members, posts, [posters], recent] = await Promise.all([
    db
      .select({ circleId: circleMembers.circleId, count: count() })
      .from(circleMembers)
      .where(inArray(circleMembers.circleId, circleIds))
      .groupBy(circleMembers.circleId),
    db.select({ circleId: circlePosts.circleId, count: count() }).from(circlePosts).where(today).groupBy(circlePosts.circleId),
    db.select({ count: countDistinct(circlePosts.userId) }).from(circlePosts).where(today),
    db.execute(recentPosters) as Promise<{ rows: { circle_id: number; user_id: string; name: string }[] }>,
  ])

  const memberCount = new Map(members.map((row) => [row.circleId, Number(row.count)]))
  const todayCount = new Map(posts.map((row) => [row.circleId, Number(row.count)]))
  const hot = new Set(hotCircleIds(circleIds.map((id) => ({ id, today: todayCount.get(id) ?? 0 }))))
  return {
    postersToday: Number(posters?.count ?? 0),
    circles: circleIds.map((id) => ({
      id,
      members: memberCount.get(id) ?? 0,
      today: todayCount.get(id) ?? 0,
      hot: hot.has(id),
      recent: recent.rows.filter((row) => Number(row.circle_id) === id).map((row) => person(row.user_id, row.name)),
    })),
  }
}

/** The circles the member joined, in the order they joined them. */
export async function joinedCircles(payload: Payload, userId: string, circleIds: number[]): Promise<number[]> {
  if (circleIds.length === 0) return []
  const rows = await drizzleOf(payload)
    .select({ circleId: circleMembers.circleId })
    .from(circleMembers)
    .where(and(eq(circleMembers.userId, userId), inArray(circleMembers.circleId, circleIds)))
    .orderBy(circleMembers.id)
  return rows.map((row) => row.circleId)
}

/** Joins the circle or leaves it; doing what is already done changes nothing. */
export async function setMembership(payload: Payload, circleId: number, userId: string, joined: boolean): Promise<void> {
  const db = drizzleOf(payload)
  if (joined) await db.insert(circleMembers).values({ circleId, userId }).onConflictDoNothing()
  else await db.delete(circleMembers).where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)))
}

/** The reactions on these posts for the reader (null for a visitor): counts, theirs, and two of the others' names. */
export async function reactionsFor(payload: Payload, postIds: number[], userId: string | null): Promise<Map<number, ReactionView[]>> {
  const result = new Map<number, ReactionView[]>()
  if (postIds.length === 0) return result
  // No member has an empty id, so a visitor's reactions are nobody's.
  const me = userId ?? ''
  const rows = await drizzleOf(payload)
    .select({
      postId: circlePostReactions.postId,
      reaction: circlePostReactions.reaction,
      count: count(),
      mine: sql<boolean>`coalesce(bool_or(${circlePostReactions.userId} = ${me}), false)`,
      names: sql<string[] | null>`(array_agg(${authUsers.name} order by ${circlePostReactions.createdAt} desc) filter (where ${circlePostReactions.userId} <> ${me}))[1:2]`,
    })
    .from(circlePostReactions)
    .innerJoin(authUsers, eq(authUsers.id, circlePostReactions.userId))
    .where(inArray(circlePostReactions.postId, postIds))
    .groupBy(circlePostReactions.postId, circlePostReactions.reaction)
  for (const row of rows) {
    const list = result.get(row.postId) ?? []
    list.push({ reaction: row.reaction, count: Number(row.count), mine: Boolean(row.mine), names: (row.names ?? []).map(cleanName) })
    result.set(row.postId, list)
  }
  for (const [postId, list] of result) result.set(postId, sortReactions(list))
  return result
}

const parentComment = alias(circleComments, 'parent_comment')

/**
 * The comments and replies everyone can see on each of these posts (docs/specs/circles.md rule
 * 15): shown ones, not under a hidden comment.
 */
export async function commentCounts(payload: Payload, postIds: number[]): Promise<Map<number, number>> {
  if (postIds.length === 0) return new Map()
  const rows = await drizzleOf(payload)
    .select({ postId: circleComments.postId, count: count() })
    .from(circleComments)
    .leftJoin(parentComment, eq(parentComment.id, circleComments.parentId))
    .where(
      and(
        inArray(circleComments.postId, postIds),
        eq(circleComments.status, 'shown'),
        or(isNull(circleComments.parentId), eq(parentComment.status, 'shown')),
      ),
    )
    .groupBy(circleComments.postId)
  return new Map(rows.map((row) => [row.postId, Number(row.count)]))
}

const postColumns = {
  id: circlePosts.id,
  circleId: circlePosts.circleId,
  userId: circlePosts.userId,
  body: circlePosts.body,
  lang: circlePosts.lang,
  status: circlePosts.status,
  videoId: circlePosts.videoId,
  createdAt: circlePosts.createdAt,
  name: authUsers.name,
}

type PostRow = {
  id: number
  circleId: number
  userId: string
  body: string
  lang: string
  status: PostStatus
  videoId: number | null
  createdAt: Date
  name: string
}

async function toViews(payload: Payload, rows: PostRow[], userId: string | null): Promise<PostView[]> {
  // A hidden post's pictures are no longer public, and its video and comments go with them.
  const shown = rows.filter((row) => row.status === 'shown')
  const [reacted, { byPost }, videos, comments] = await Promise.all([
    reactionsFor(
      payload,
      rows.map((row) => row.id),
      userId,
    ),
    imageViews(payload, { postIds: shown.map((row) => row.id), coverIds: [] }),
    videoViews(payload, [...new Set(shown.flatMap((row) => (row.videoId ? [row.videoId] : [])))]),
    commentCounts(
      payload,
      shown.map((row) => row.id),
    ),
  ])
  return rows.map((row) => ({
    id: row.id,
    circle: row.circleId,
    body: row.body,
    lang: row.lang,
    author: person(row.userId, row.name),
    mine: row.userId === userId,
    hidden: row.status === 'hidden',
    createdAt: row.createdAt.toISOString(),
    reactions: reacted.get(row.id) ?? [],
    images: row.status === 'shown' ? (byPost.get(row.id) ?? []) : [],
    video: row.status === 'shown' && row.videoId ? (videos.get(row.videoId) ?? null) : null,
    comments: comments.get(row.id) ?? 0,
    links: [],
  }))
}

export type FeedQuery = {
  tab: FeedTab
  /** The circles readers can see. */
  circleIds: number[]
  /** Only this circle (one of `circleIds`). */
  circle: number | null
  /** From the last page: an id for 最新 and 我的圈子, how many were read for 推荐. */
  cursor: number | null
  userId: string | null
}

/**
 * One page of a feed: 最新 newest first; 我的圈子 the same, in the circles the member joined
 * (nothing for a visitor); 推荐 the last `hotDays` days by ./rules.ts hotScore, which the SQL
 * here mirrors (commenters are people with a shown comment, the author aside). 推荐 pages by
 * position, so a post that moves up meanwhile can come twice; the page drops repeats.
 */
export async function feedPage(payload: Payload, query: FeedQuery, now = new Date()): Promise<{ posts: PostView[]; next: number | null }> {
  const { tab, circle, cursor, userId } = query
  const circleIds = circle === null ? query.circleIds : query.circleIds.filter((id) => id === circle)
  if (circleIds.length === 0 || (tab === 'mine' && !userId)) return { posts: [], next: null }
  const db = drizzleOf(payload)
  const size = circleRules.pageSize
  const where = [readable(circleIds, userId)]
  if (tab === 'mine' && userId) {
    where.push(
      inArray(
        circlePosts.circleId,
        db.select({ id: circleMembers.circleId }).from(circleMembers).where(eq(circleMembers.userId, userId)),
      ),
    )
  }

  if (tab === 'hot') {
    const since = new Date(now.getTime() - circleRules.hotDays * 24 * 60 * 60 * 1000)
    const people = sql`(select count(distinct ${circlePostReactions.userId}) from ${circlePostReactions} where ${circlePostReactions.postId} = ${circlePosts.id})`
    const commenters = sql`(select count(distinct ${circleComments.userId}) from ${circleComments} where ${and(
      eq(circleComments.postId, circlePosts.id),
      eq(circleComments.status, 'shown'),
      ne(circleComments.userId, circlePosts.userId),
    )})`
    const hours = sql`(extract(epoch from (${now.toISOString()}::timestamptz - ${circlePosts.createdAt})) / 3600)`
    const score = sql`((${people} + 2 * ${commenters} + 1) / power(greatest(${hours}, 0) + 2, 1.5))`
    const offset = cursor ?? 0
    const rows = await db
      .select(postColumns)
      .from(circlePosts)
      .innerJoin(authUsers, eq(authUsers.id, circlePosts.userId))
      .where(and(...where, gte(circlePosts.createdAt, since)))
      .orderBy(desc(score), desc(circlePosts.id))
      .limit(size + 1)
      .offset(offset)
    const page = rows.slice(0, size)
    return { posts: await toViews(payload, page, userId), next: rows.length > size ? offset + size : null }
  }

  const rows = await db
    .select(postColumns)
    .from(circlePosts)
    .innerJoin(authUsers, eq(authUsers.id, circlePosts.userId))
    .where(and(...where, cursor ? lt(circlePosts.id, cursor) : undefined))
    .orderBy(desc(circlePosts.id))
    .limit(size + 1)
  const page = rows.slice(0, size)
  return { posts: await toViews(payload, page, userId), next: rows.length > size ? page[page.length - 1].id : null }
}

/** One post as its author or a reader gets it; null when they cannot see it. */
export async function postView(payload: Payload, postId: number, circleIds: number[], userId: string | null): Promise<PostView | null> {
  const rows = await drizzleOf(payload)
    .select(postColumns)
    .from(circlePosts)
    .innerJoin(authUsers, eq(authUsers.id, circlePosts.userId))
    .where(and(eq(circlePosts.id, postId), readable(circleIds, userId)))
    .limit(1)
  const [view] = await toViews(payload, rows, userId)
  return view ?? null
}

export type CreatePostResult = { status: 'created'; postId: number } | { status: 'daily-limit' | 'invalid-images' | 'invalid-video' }

/**
 * Publishes the member's post in the circle and joins them to it. At most `dailyPosts` a Shanghai
 * day; a post they deleted no longer counts. The pictures must be ones they uploaded and have not
 * posted yet; they become public with the post.
 */
export async function createPost(
  payload: Payload,
  post: { circleId: number; userId: string; body: string; lang: string; images?: number[]; videoId?: number | null },
  now = new Date(),
): Promise<CreatePostResult> {
  const { images = [], videoId = null, ...values } = post
  const db = drizzleOf(payload)
  const [today] = await db
    .select({ count: count() })
    .from(circlePosts)
    .where(and(eq(circlePosts.userId, post.userId), gte(circlePosts.createdAt, shanghaiDayStart(now))))
  if (Number(today?.count ?? 0) >= circleRules.dailyPosts) return { status: 'daily-limit' }
  if (!(await claimable(payload, images, post.userId))) return { status: 'invalid-images' }
  if (videoId !== null && !(await videoExists(payload, videoId))) return { status: 'invalid-video' }
  const [created] = await db
    .insert(circlePosts)
    .values({ ...values, videoId })
    .returning({ id: circlePosts.id })
  await attachImages(payload, images, { postId: created.id, circleId: post.circleId })
  await setMembership(payload, post.circleId, post.userId, true)
  return { status: 'created', postId: created.id }
}

/** Deletes the member's own post, with its reactions, reports, comments and pictures; false when they have no such post. */
export async function deletePost(payload: Payload, postId: number, userId: string): Promise<boolean> {
  const deleted = await drizzleOf(payload)
    .delete(circlePosts)
    .where(and(eq(circlePosts.id, postId), eq(circlePosts.userId, userId)))
    .returning({ id: circlePosts.id })
  if (deleted.length === 0) return false
  await deleteImages(payload, { post: { equals: postId } })
  return true
}

/** Whether readers can see the post (shown, in a circle they can see): only those take reactions, reports and comments. */
export async function shownPost(payload: Payload, postId: number, circleIds: number[]): Promise<{ userId: string } | null> {
  if (circleIds.length === 0) return null
  const [post] = await drizzleOf(payload)
    .select({ userId: circlePosts.userId })
    .from(circlePosts)
    .where(and(eq(circlePosts.id, postId), eq(circlePosts.status, 'shown'), inArray(circlePosts.circleId, circleIds)))
    .limit(1)
  return post ?? null
}

/** Gives or takes back the member's reaction; the post's reactions after it, or null when readers cannot see the post. */
export async function setReaction(
  payload: Payload,
  change: { postId: number; userId: string; reaction: Reaction; on: boolean },
  circleIds: number[],
): Promise<ReactionView[] | null> {
  const { postId, userId, reaction, on } = change
  if (!(await shownPost(payload, postId, circleIds))) return null
  const db = drizzleOf(payload)
  if (on) await db.insert(circlePostReactions).values({ postId, userId, reaction }).onConflictDoNothing()
  else
    await db
      .delete(circlePostReactions)
      .where(and(eq(circlePostReactions.postId, postId), eq(circlePostReactions.userId, userId), eq(circlePostReactions.reaction, reaction)))
  return (await reactionsFor(payload, [postId], userId)).get(postId) ?? []
}

export type ReportResult = 'reported' | 'not-found' | 'own-post'

/** Records a reader's report of a shown post, once per reporter. */
export async function reportPost(
  payload: Payload,
  report: { postId: number; reason: ReportReason; reporter: string; userId: string | null },
  circleIds: number[],
): Promise<ReportResult> {
  const post = await shownPost(payload, report.postId, circleIds)
  if (!post) return 'not-found'
  if (post.userId === report.userId) return 'own-post'
  await drizzleOf(payload)
    .insert(circlePostReports)
    .values({ postId: report.postId, reporter: report.reporter, reason: report.reason })
    .onConflictDoNothing()
  return 'reported'
}
