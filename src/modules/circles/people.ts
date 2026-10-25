import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, eq, gte, inArray, max, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import { authUsers } from '@/lib/auth/schema'
import { cleanName } from '@/modules/apps/reviews/rules'
import { profileRules, rankSuggestions } from '@/modules/profiles/rules'
import { memberFollows } from '@/modules/profiles/schema'

import { circleComments, circlePostReactions, circlePosts } from './schema'

/**
 * 「值得关注的人」(docs/specs/circles.md rule 21): who posted in the circles readers can see over
 * the last `suggestionDays` days, ranked by how many people reacted to or commented on those
 * posts. Shared by every reader for a few minutes (./public.ts); each reader's own follows are
 * taken out afterwards (src/app/api/circles/people).
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** Ids stay on the server: the reader gets the name, the tone and the address (src/modules/profiles/rules.ts SuggestedPerson). */
export type SuggestionCandidate = {
  userId: string
  name: string
  tone: number
  handle: string
  /** People who reacted to or commented on their recent posts, themselves aside. */
  people: number
  posts: number
  /** Their latest post's id: the most recent first when the rest is equal. */
  lastPost: number
  /** The circle they posted most in, the latest of those when two are level. */
  circle: number | null
  followers: number
}

/** Enough for the reader's own twelve once the people they follow and they themselves are out. */
const candidatePool = 60

export async function suggestionCandidates(payload: Payload, circleIds: number[], now = new Date()): Promise<SuggestionCandidate[]> {
  if (circleIds.length === 0) return []
  const db = drizzleOf(payload)
  const since = new Date(now.getTime() - profileRules.suggestionDays * 24 * 60 * 60 * 1000)
  const recent = and(eq(circlePosts.status, 'shown'), inArray(circlePosts.circleId, circleIds), gte(circlePosts.createdAt, since))

  const [byCircle, engaged] = await Promise.all([
    db
      .select({ userId: circlePosts.userId, circleId: circlePosts.circleId, posts: count(), lastPost: max(circlePosts.id) })
      .from(circlePosts)
      .where(recent)
      .groupBy(circlePosts.userId, circlePosts.circleId),
    db.execute(sql`
      select author_id, count(distinct engager_id)::int as people from (
        select ${circlePosts.userId} as author_id, ${circlePostReactions.userId} as engager_id
        from ${circlePostReactions} inner join ${circlePosts} on ${circlePosts.id} = ${circlePostReactions.postId}
        where ${recent}
        union all
        select ${circlePosts.userId}, ${circleComments.userId}
        from ${circleComments} inner join ${circlePosts} on ${circlePosts.id} = ${circleComments.postId}
        where ${and(recent, eq(circleComments.status, 'shown'))}
      ) as engagement
      where engager_id <> author_id
      group by author_id`) as Promise<{ rows: { author_id: string; people: number }[] }>,
  ])
  if (byCircle.length === 0) return []

  const people = new Map(engaged.rows.map((row) => [row.author_id, Number(row.people)]))
  const posters = new Map<string, { posts: number; lastPost: number; circle: number; circlePosts: number; circleLast: number }>()
  for (const row of byCircle) {
    const posts = Number(row.posts)
    const last = Number(row.lastPost ?? 0)
    const seen = posters.get(row.userId)
    if (!seen) {
      posters.set(row.userId, { posts, lastPost: last, circle: row.circleId, circlePosts: posts, circleLast: last })
      continue
    }
    seen.posts += posts
    seen.lastPost = Math.max(seen.lastPost, last)
    if (posts > seen.circlePosts || (posts === seen.circlePosts && last > seen.circleLast)) {
      Object.assign(seen, { circle: row.circleId, circlePosts: posts, circleLast: last })
    }
  }

  const ranked = rankSuggestions(
    [...posters].map(([userId, poster]) => ({ userId, people: people.get(userId) ?? 0, posts: poster.posts, lastPost: poster.lastPost })),
    { exclude: new Set(), limit: candidatePool },
  )
  const ids = ranked.map((candidate) => candidate.userId)
  const [members, followers] = await Promise.all([
    db.select({ id: authUsers.id, name: authUsers.name, handle: authUsers.handle }).from(authUsers).where(inArray(authUsers.id, ids)),
    db
      .select({ id: memberFollows.followeeId, count: count() })
      .from(memberFollows)
      .where(inArray(memberFollows.followeeId, ids))
      .groupBy(memberFollows.followeeId),
  ])
  const memberOf = new Map(members.map((member) => [member.id, member]))
  const followersOf = new Map(followers.map((row) => [row.id, Number(row.count)]))
  return ranked.flatMap((candidate) => {
    const member = memberOf.get(candidate.userId)
    if (!member?.handle) return []
    return [
      {
        ...candidate,
        name: cleanName(member.name),
        tone: toneFor(candidate.userId),
        handle: member.handle,
        circle: posters.get(candidate.userId)?.circle ?? null,
        followers: followersOf.get(candidate.userId) ?? 0,
      },
    ]
  })
}

/**
 * The names and addresses of these members as they are now: the candidates are minutes old, and
 * someone may since have renamed, moved to another address or deleted their account (then missing).
 */
export async function currentMembers(payload: Payload, ids: string[]): Promise<Map<string, { name: string; handle: string }>> {
  if (ids.length === 0) return new Map()
  const rows = await drizzleOf(payload)
    .select({ id: authUsers.id, name: authUsers.name, handle: authUsers.handle })
    .from(authUsers)
    .where(inArray(authUsers.id, ids))
  return new Map(rows.flatMap((row) => (row.handle ? [[row.id, { name: cleanName(row.name), handle: row.handle }] as const] : [])))
}
