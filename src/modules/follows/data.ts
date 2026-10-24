import { and, count, desc, eq, or } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { follows } from './schema'
import { followId, maxFollows, type FollowTarget, type FollowType } from './target'

/** What a page's follow buttons show: which of its targets the member follows (by id), and how many members follow each. */
export type FollowStates = { following: string[]; counts: Record<string, number> }

/** One target after following or unfollowing it. */
export type FollowState = { following: boolean; count: number }

const onTarget = ({ type, key }: FollowTarget) => and(eq(follows.targetType, type), eq(follows.targetKey, key))

/** Which of the targets `userId` (null for a visitor) follows, and how many members follow each. */
export async function followStates(targets: readonly FollowTarget[], userId: string | null): Promise<FollowStates> {
  if (targets.length === 0) return { following: [], counts: {} }
  const { db } = await getDb()
  const anyTarget = or(...targets.map(onTarget))
  const [totals, mine] = await Promise.all([
    db
      .select({ type: follows.targetType, key: follows.targetKey, count: count() })
      .from(follows)
      .where(anyTarget)
      .groupBy(follows.targetType, follows.targetKey),
    userId
      ? db
          .select({ type: follows.targetType, key: follows.targetKey })
          .from(follows)
          .where(and(eq(follows.userId, userId), anyTarget))
      : Promise.resolve([]),
  ])
  const counts: Record<string, number> = Object.fromEntries(targets.map((target) => [followId(target), 0]))
  for (const row of totals) counts[followId(row)] = Number(row.count)
  return { following: mine.map(followId), counts }
}

/**
 * Follows or unfollows the target for the member. Following again keeps the first follow and its
 * time; a new follow past the limit is refused with 'too-many'.
 */
export async function setFollowing(target: FollowTarget, userId: string, following: boolean): Promise<FollowState | 'too-many'> {
  const { db } = await getDb()
  if (following) {
    const [[already], [mine]] = await Promise.all([
      db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.userId, userId), onTarget(target)))
        .limit(1),
      db.select({ count: count() }).from(follows).where(eq(follows.userId, userId)),
    ])
    if (!already) {
      if (Number(mine?.count ?? 0) >= maxFollows) return 'too-many'
      await db
        .insert(follows)
        .values({ userId, targetType: target.type, targetKey: target.key })
        .onConflictDoNothing({ target: [follows.userId, follows.targetType, follows.targetKey] })
    }
  } else {
    await db.delete(follows).where(and(eq(follows.userId, userId), onTarget(target)))
  }
  const states = await followStates([target], userId)
  return { following: states.following.length > 0, count: states.counts[followId(target)] ?? 0 }
}

/** Everything the member follows, newest first. */
export async function memberFollows(userId: string): Promise<{ type: FollowType; key: string; createdAt: Date }[]> {
  const { db } = await getDb()
  return db
    .select({ type: follows.targetType, key: follows.targetKey, createdAt: follows.createdAt })
    .from(follows)
    .where(eq(follows.userId, userId))
    .orderBy(desc(follows.createdAt), desc(follows.id))
}

/**
 * Whether the target can be followed now: any industry tag (the request's parsing checks it is
 * one), and a company or product only while a published story is about it.
 */
export async function isFollowable(target: FollowTarget): Promise<boolean> {
  if (target.type === 'tag') return true
  const { payload } = await getDb()
  const { totalDocs } = await payload.count({
    collection: 'stories',
    where: { and: [{ status: { equals: 'published' } }, { 'entities.key': { equals: target.key } }] },
    overrideAccess: false,
  })
  return totalDocs > 0
}
