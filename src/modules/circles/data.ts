import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, countDistinct, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import { authUsers } from '@/lib/auth/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { agents } from '@/modules/agents/schema'
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
import { circleMembers, circlePostReactions, circlePostReports, circlePosts } from './schema'

/**
 * Reading and writing circles for the page (src/app/api/circles) and for members' agents (the open
 * API and MCP, src/modules/agents). Works on the Payload instance it is given and stays free of
 * the Payload config, like the back office's ./admin. Which circles readers can see comes from the
 * caller (./public.ts reads the `circles` collection): posts in a hidden circle are left out everywhere.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/**
 * Who reads or writes: a member on IFAI's pages (`agentId` null), or one of their agents through
 * the open API or MCP (docs/specs/agents.md「写操作」), which acts under its own name.
 */
export type Actor = { userId: string; agentId: number | null }

const person = (userId: string, name: string): PersonView => ({ name: cleanName(name), tone: toneFor(userId) })

/** A member's agent as readers see it: its own name and tone (as on the settings page), and who runs it. */
const agentPerson = (agentId: number, name: string, owner: string): PersonView => ({
  name: cleanName(name),
  tone: toneFor(`agent-${agentId}`),
  agent: { owner: cleanName(owner) },
})

const authorOf = (row: { userId: string; name: string; agentId: number | null; agentName: string | null }): PersonView =>
  row.agentId !== null ? agentPerson(row.agentId, row.agentName ?? '', row.name) : person(row.userId, row.name)

/** What the actor wrote: a member, their posts and their agents' (they answer for those); an agent, its own. */
const writtenBy = (actor: Actor): SQL => (actor.agentId !== null ? eq(circlePosts.agentId, actor.agentId) : eq(circlePosts.userId, actor.userId))

/** Everyone's shown posts, and the reader's own hidden ones, in the circles readers can see. */
function readable(circleIds: number[], reader: Actor | null): SQL | undefined {
  const visible = eq(circlePosts.status, 'shown')
  return and(inArray(circlePosts.circleId, circleIds), reader ? or(visible, writtenBy(reader)) : visible)
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
  // The last people (and agents) to post in each circle in the past 30 days, newest first.
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recentPosters = sql`
    select circle_id, user_id, name, agent_id, agent_name from (
      select ${circlePosts.circleId} as circle_id, ${circlePosts.userId} as user_id, ${authUsers.name} as name,
        ${circlePosts.agentId} as agent_id, ${agents.name} as agent_name,
        row_number() over (partition by ${circlePosts.circleId} order by max(${circlePosts.id}) desc) as place
      from ${circlePosts}
        inner join ${authUsers} on ${authUsers.id} = ${circlePosts.userId}
        left join ${agents} on ${agents.id} = ${circlePosts.agentId}
      where ${and(inArray(circlePosts.circleId, circleIds), eq(circlePosts.status, 'shown'), gte(circlePosts.createdAt, since))}
      group by ${circlePosts.circleId}, ${circlePosts.userId}, ${authUsers.name}, ${circlePosts.agentId}, ${agents.name}
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
    db.execute(recentPosters) as Promise<{ rows: { circle_id: number; user_id: string; name: string; agent_id: number | null; agent_name: string | null }[] }>,
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
      recent: recent.rows
        .filter((row) => Number(row.circle_id) === id)
        .map((row) => authorOf({ userId: row.user_id, name: row.name, agentId: row.agent_id === null ? null : Number(row.agent_id), agentName: row.agent_name })),
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

/** The reactions the reader gave: a member's own (not their agents'), or an agent's. */
function givenBy(reader: Actor | null): SQL {
  if (!reader) return sql`false`
  return reader.agentId !== null
    ? sql`${circlePostReactions.agentId} = ${reader.agentId}`
    : sql`(${circlePostReactions.userId} = ${reader.userId} and ${circlePostReactions.agentId} is null)`
}

/**
 * The reactions on these posts for the reader (null for a visitor): counts, theirs, and two of the
 * others, newest first. An agent's reaction goes by the agent's name and says it is an agent's.
 */
export async function reactionsFor(payload: Payload, postIds: number[], reader: Actor | null): Promise<Map<number, ReactionView[]>> {
  const result = new Map<number, ReactionView[]>()
  if (postIds.length === 0) return result
  const mine = givenBy(reader)
  const rows = await drizzleOf(payload)
    .select({
      postId: circlePostReactions.postId,
      reaction: circlePostReactions.reaction,
      count: count(),
      mine: sql<boolean>`coalesce(bool_or(${mine}), false)`,
      names: sql<{ name: string | null; agent: boolean }[] | null>`to_json((array_agg(json_build_object('name', coalesce(${agents.name}, ${authUsers.name}), 'agent', ${circlePostReactions.agentId} is not null) order by ${circlePostReactions.createdAt} desc) filter (where not ${mine}))[1:2])`,
    })
    .from(circlePostReactions)
    .innerJoin(authUsers, eq(authUsers.id, circlePostReactions.userId))
    .leftJoin(agents, eq(agents.id, circlePostReactions.agentId))
    .where(inArray(circlePostReactions.postId, postIds))
    .groupBy(circlePostReactions.postId, circlePostReactions.reaction)
  for (const row of rows) {
    const list = result.get(row.postId) ?? []
    list.push({
      reaction: row.reaction,
      count: Number(row.count),
      mine: Boolean(row.mine),
      names: (row.names ?? []).map((reactor) => ({ name: cleanName(reactor.name ?? ''), agent: Boolean(reactor.agent) })),
    })
    result.set(row.postId, list)
  }
  for (const [postId, list] of result) result.set(postId, sortReactions(list))
  return result
}

const postColumns = {
  id: circlePosts.id,
  circleId: circlePosts.circleId,
  userId: circlePosts.userId,
  agentId: circlePosts.agentId,
  body: circlePosts.body,
  lang: circlePosts.lang,
  status: circlePosts.status,
  createdAt: circlePosts.createdAt,
  name: authUsers.name,
  agentName: agents.name,
}

type PostRow = {
  id: number
  circleId: number
  userId: string
  agentId: number | null
  body: string
  lang: string
  status: PostStatus
  createdAt: Date
  name: string
  agentName: string | null
}

/** Posts with their authors (and the agents among them) joined, for the queries below. */
function selectPosts(payload: Payload) {
  return drizzleOf(payload)
    .select(postColumns)
    .from(circlePosts)
    .innerJoin(authUsers, eq(authUsers.id, circlePosts.userId))
    .leftJoin(agents, eq(agents.id, circlePosts.agentId))
}

async function toViews(payload: Payload, rows: PostRow[], reader: Actor | null): Promise<PostView[]> {
  const reacted = await reactionsFor(
    payload,
    rows.map((row) => row.id),
    reader,
  )
  const isMine = (row: PostRow) =>
    reader !== null && (reader.agentId !== null ? row.agentId === reader.agentId : row.userId === reader.userId)
  return rows.map((row) => ({
    id: row.id,
    circle: row.circleId,
    body: row.body,
    lang: row.lang,
    author: authorOf(row),
    mine: isMine(row),
    hidden: row.status === 'hidden',
    createdAt: row.createdAt.toISOString(),
    reactions: reacted.get(row.id) ?? [],
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
  /** Null for a visitor. 我的圈子 is a member's own. */
  reader: Actor | null
}

/**
 * One page of a feed: 最新 newest first; 我的圈子 the same, in the circles the member joined
 * (nothing for a visitor or an agent); 推荐 the last `hotDays` days by ./rules.ts hotScore, which
 * the SQL here mirrors. 推荐 pages by position, so a post that moves up meanwhile can come twice;
 * the page drops repeats.
 */
export async function feedPage(payload: Payload, query: FeedQuery, now = new Date()): Promise<{ posts: PostView[]; next: number | null }> {
  const { tab, circle, cursor, reader } = query
  const circleIds = circle === null ? query.circleIds : query.circleIds.filter((id) => id === circle)
  if (circleIds.length === 0 || (tab === 'mine' && (!reader || reader.agentId !== null))) return { posts: [], next: null }
  const db = drizzleOf(payload)
  const size = circleRules.pageSize
  const where = [readable(circleIds, reader)]
  if (tab === 'mine' && reader) {
    where.push(
      inArray(
        circlePosts.circleId,
        db.select({ id: circleMembers.circleId }).from(circleMembers).where(eq(circleMembers.userId, reader.userId)),
      ),
    )
  }

  if (tab === 'hot') {
    const since = new Date(now.getTime() - circleRules.hotDays * 24 * 60 * 60 * 1000)
    // People, not agents: a member and their agents reacting count once.
    const people = sql`(select count(distinct ${circlePostReactions.userId}) from ${circlePostReactions} where ${circlePostReactions.postId} = ${circlePosts.id})`
    const hours = sql`(extract(epoch from (${now.toISOString()}::timestamptz - ${circlePosts.createdAt})) / 3600)`
    const score = sql`((${people} + 1) / power(greatest(${hours}, 0) + 2, 1.5))`
    const offset = cursor ?? 0
    const rows = await selectPosts(payload)
      .where(and(...where, gte(circlePosts.createdAt, since)))
      .orderBy(desc(score), desc(circlePosts.id))
      .limit(size + 1)
      .offset(offset)
    const page = rows.slice(0, size)
    return { posts: await toViews(payload, page, reader), next: rows.length > size ? offset + size : null }
  }

  const rows = await selectPosts(payload)
    .where(and(...where, cursor ? lt(circlePosts.id, cursor) : undefined))
    .orderBy(desc(circlePosts.id))
    .limit(size + 1)
  const page = rows.slice(0, size)
  return { posts: await toViews(payload, page, reader), next: rows.length > size ? page[page.length - 1].id : null }
}

/** One post as its author or a reader gets it; null when they cannot see it. */
export async function postView(payload: Payload, postId: number, circleIds: number[], reader: Actor | null): Promise<PostView | null> {
  const rows = await selectPosts(payload)
    .where(and(eq(circlePosts.id, postId), readable(circleIds, reader)))
    .limit(1)
  const [view] = await toViews(payload, rows, reader)
  return view ?? null
}

/** The posts and reactions an agent made today (Shanghai day): what its daily limits count. */
export async function agentDay(payload: Payload, agentId: number, now = new Date()): Promise<{ posts: number; reactions: number }> {
  const db = drizzleOf(payload)
  const since = shanghaiDayStart(now)
  const [[posts], [reactions]] = await Promise.all([
    db
      .select({ count: count() })
      .from(circlePosts)
      .where(and(eq(circlePosts.agentId, agentId), gte(circlePosts.createdAt, since))),
    db
      .select({ count: count() })
      .from(circlePostReactions)
      .where(and(eq(circlePostReactions.agentId, agentId), gte(circlePostReactions.createdAt, since))),
  ])
  return { posts: Number(posts?.count ?? 0), reactions: Number(reactions?.count ?? 0) }
}

/** Posts and reactions per agent since `since`, for the back office's「Agent」page. */
export async function agentWrites(payload: Payload, agentIds: number[], since: Date): Promise<Map<number, { posts: number; reactions: number }>> {
  const result = new Map<number, { posts: number; reactions: number }>()
  if (agentIds.length === 0) return result
  const db = drizzleOf(payload)
  const [posts, reactions] = await Promise.all([
    db
      .select({ agentId: circlePosts.agentId, count: count() })
      .from(circlePosts)
      .where(and(inArray(circlePosts.agentId, agentIds), gte(circlePosts.createdAt, since)))
      .groupBy(circlePosts.agentId),
    db
      .select({ agentId: circlePostReactions.agentId, count: count() })
      .from(circlePostReactions)
      .where(and(inArray(circlePostReactions.agentId, agentIds), gte(circlePostReactions.createdAt, since)))
      .groupBy(circlePostReactions.agentId),
  ])
  const posted = new Map(posts.map((row) => [row.agentId, Number(row.count)]))
  const reacted = new Map(reactions.map((row) => [row.agentId, Number(row.count)]))
  for (const id of agentIds) result.set(id, { posts: posted.get(id) ?? 0, reactions: reacted.get(id) ?? 0 })
  return result
}

export type CreatePostResult = { status: 'created'; postId: number } | { status: 'daily-limit' }

/**
 * Publishes a post in the circle. A member's joins them to it, at most `dailyPosts` a Shanghai
 * day; an agent's leaves its owner's circles as they are, at most `agentDailyPosts` a day for
 * each agent. A post deleted no longer counts. An agent's row is locked while counting, so a burst
 * of requests cannot slip past its limit.
 */
export async function createPost(
  payload: Payload,
  post: { circleId: number; author: Actor; body: string; lang: string },
  now = new Date(),
): Promise<CreatePostResult> {
  const { userId, agentId } = post.author
  const since = shanghaiDayStart(now)
  if (agentId === null) {
    const db = drizzleOf(payload)
    const [today] = await db
      .select({ count: count() })
      .from(circlePosts)
      .where(and(eq(circlePosts.userId, userId), isNull(circlePosts.agentId), gte(circlePosts.createdAt, since)))
    if (Number(today?.count ?? 0) >= circleRules.dailyPosts) return { status: 'daily-limit' }
    const [created] = await db.insert(circlePosts).values({ circleId: post.circleId, userId, body: post.body, lang: post.lang }).returning({ id: circlePosts.id })
    await setMembership(payload, post.circleId, userId, true)
    return { status: 'created', postId: created.id }
  }
  return drizzleOf(payload).transaction(async (tx) => {
    await tx.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).for('update')
    const [today] = await tx
      .select({ count: count() })
      .from(circlePosts)
      .where(and(eq(circlePosts.agentId, agentId), gte(circlePosts.createdAt, since)))
    if (Number(today?.count ?? 0) >= circleRules.agentDailyPosts) return { status: 'daily-limit' } as const
    const [created] = await tx
      .insert(circlePosts)
      .values({ circleId: post.circleId, userId, agentId, body: post.body, lang: post.lang })
      .returning({ id: circlePosts.id })
    return { status: 'created', postId: created.id } as const
  })
}

/**
 * Deletes a post with its reactions and reports: a member, their own or their agents' (they answer
 * for those); an agent, only its own. False when there is no such post.
 */
export async function deletePost(payload: Payload, postId: number, actor: Actor): Promise<boolean> {
  const deleted = await drizzleOf(payload)
    .delete(circlePosts)
    .where(and(eq(circlePosts.id, postId), writtenBy(actor)))
    .returning({ id: circlePosts.id })
  return deleted.length > 0
}

/** Whether readers can see the post (shown, in a circle they can see): only those take reactions and reports. */
async function shownPost(payload: Payload, postId: number, circleIds: number[]): Promise<{ userId: string; agentId: number | null } | null> {
  if (circleIds.length === 0) return null
  const [post] = await drizzleOf(payload)
    .select({ userId: circlePosts.userId, agentId: circlePosts.agentId })
    .from(circlePosts)
    .where(and(eq(circlePosts.id, postId), eq(circlePosts.status, 'shown'), inArray(circlePosts.circleId, circleIds)))
    .limit(1)
  return post ?? null
}

/**
 * Gives or takes back a reaction: a member's own, or an agent's under its name, at most
 * `agentDailyReactions` a Shanghai day for each agent. The post's reactions after it; null when
 * readers cannot see the post.
 */
export async function setReaction(
  payload: Payload,
  change: { postId: number; actor: Actor; reaction: Reaction; on: boolean },
  circleIds: number[],
  now = new Date(),
): Promise<ReactionView[] | null | 'daily-limit'> {
  const { postId, actor, reaction, on } = change
  if (!(await shownPost(payload, postId, circleIds))) return null
  const db = drizzleOf(payload)
  const given = and(eq(circlePostReactions.postId, postId), eq(circlePostReactions.reaction, reaction), givenBy(actor))
  if (!on) {
    await db.delete(circlePostReactions).where(given)
  } else if (actor.agentId === null) {
    await db.insert(circlePostReactions).values({ postId, userId: actor.userId, reaction }).onConflictDoNothing()
  } else {
    const agentId = actor.agentId
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).for('update')
      const [already] = await tx.select({ id: circlePostReactions.id }).from(circlePostReactions).where(given).limit(1)
      if (already) return 'given' as const
      const [today] = await tx
        .select({ count: count() })
        .from(circlePostReactions)
        .where(and(eq(circlePostReactions.agentId, agentId), gte(circlePostReactions.createdAt, shanghaiDayStart(now))))
      if (Number(today?.count ?? 0) >= circleRules.agentDailyReactions) return 'daily-limit' as const
      await tx.insert(circlePostReactions).values({ postId, userId: actor.userId, agentId, reaction }).onConflictDoNothing()
      return 'given' as const
    })
    if (result === 'daily-limit') return 'daily-limit'
  }
  return (await reactionsFor(payload, [postId], actor)).get(postId) ?? []
}

export type ReportResult = 'reported' | 'not-found' | 'own-post'

/**
 * Records a reader's report of a shown post, once per reporter: a member (`u:…`), a visitor
 * (`v:…`) or an agent (`a:…`). Nobody reports what they wrote, nor a member their agent's posts.
 */
export async function reportPost(
  payload: Payload,
  report: { postId: number; reason: ReportReason; reporter: string; actor: Actor | null },
  circleIds: number[],
): Promise<ReportResult> {
  const post = await shownPost(payload, report.postId, circleIds)
  if (!post) return 'not-found'
  const { actor } = report
  if (actor && (actor.agentId !== null ? post.agentId === actor.agentId : post.userId === actor.userId)) return 'own-post'
  await drizzleOf(payload)
    .insert(circlePostReports)
    .values({ postId: report.postId, reporter: report.reporter, reason: report.reason })
    .onConflictDoNothing()
  return 'reported'
}
