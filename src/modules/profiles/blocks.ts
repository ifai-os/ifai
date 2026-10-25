import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, desc, eq, inArray, or, sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import type { AnyPgColumn } from '@payloadcms/db-postgres/drizzle/pg-core'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import { authUsers } from '@/lib/auth/schema'
import { cleanName } from '@/modules/apps/reviews/rules'

import { findByHandle } from './data'
import { profileRules, type BlockedPerson, type BlockState } from './rules'
import { memberBlocks, memberFollows } from './schema'

/**
 * Blocking (docs/specs/circles.md rule 23): once either of two members blocks the other, neither
 * sees the other's posts and comments, and neither can follow, react to or comment on the other.
 * It only concerns members: visitors see what everyone sees. Like ./data.ts, this works on the
 * Payload instance it is given.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/**
 * A condition for queries that list what members wrote: the member in `author` (a column holding
 * a member id) and the reader have not blocked each other. Nothing to add for a visitor.
 */
export function notBlocked(author: AnyPgColumn, readerId: string | null): SQL | undefined {
  if (!readerId) return undefined
  return sql`not exists (select 1 from ${memberBlocks} where (${memberBlocks.blockerId} = ${readerId} and ${memberBlocks.blockedId} = ${author}) or (${memberBlocks.blockerId} = ${author} and ${memberBlocks.blockedId} = ${readerId}))`
}

/** Which of these members the reader blocked or was blocked by. */
export async function blockedAmong(payload: Payload, readerId: string | null, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)].filter((id) => id !== readerId)
  if (!readerId || ids.length === 0) return new Set()
  const rows = await drizzleOf(payload)
    .select({ blockerId: memberBlocks.blockerId, blockedId: memberBlocks.blockedId })
    .from(memberBlocks)
    .where(
      or(
        and(eq(memberBlocks.blockerId, readerId), inArray(memberBlocks.blockedId, ids)),
        and(eq(memberBlocks.blockedId, readerId), inArray(memberBlocks.blockerId, ids)),
      ),
    )
  return new Set(rows.map((row) => (row.blockerId === readerId ? row.blockedId : row.blockerId)))
}

/** Whether the member blocked anyone or was blocked by anyone. */
export async function hasBlocks(payload: Payload, userId: string): Promise<boolean> {
  const [row] = await drizzleOf(payload)
    .select({ id: memberBlocks.id })
    .from(memberBlocks)
    .where(or(eq(memberBlocks.blockerId, userId), eq(memberBlocks.blockedId, userId)))
    .limit(1)
  return Boolean(row)
}

/** Whether the reader blocked the member (`mine`), the member blocked the reader (`theirs`), or neither. */
export async function blockState(payload: Payload, readerId: string | null, userId: string): Promise<BlockState> {
  if (!readerId || readerId === userId) return null
  const rows = await drizzleOf(payload)
    .select({ blockerId: memberBlocks.blockerId })
    .from(memberBlocks)
    .where(
      or(
        and(eq(memberBlocks.blockerId, readerId), eq(memberBlocks.blockedId, userId)),
        and(eq(memberBlocks.blockerId, userId), eq(memberBlocks.blockedId, readerId)),
      ),
    )
  if (rows.some((row) => row.blockerId === readerId)) return 'mine'
  return rows.length > 0 ? 'theirs' : null
}

/** Whether either of the two blocked the other. */
export async function blockedBetween(payload: Payload, a: string, b: string): Promise<boolean> {
  return (await blockState(payload, a, b)) !== null
}

export type BlockResult = { status: 'done'; blocked: boolean } | { status: 'not-found' | 'own-profile' }

/**
 * Blocks the member at `handle` (one they had before also works) or unblocks them. Blocking ends
 * the follows both ways, and unblocking does not bring them back. Doing what is already done
 * changes nothing.
 */
export async function setBlock(payload: Payload, change: { blockerId: string; handle: string; on: boolean }, now = new Date()): Promise<BlockResult> {
  const { blockerId, handle, on } = change
  const target = await findByHandle(payload, handle)
  if (!target) return { status: 'not-found' }
  if (target.userId === blockerId) return { status: 'own-profile' }
  const db = drizzleOf(payload)
  const pair = and(eq(memberBlocks.blockerId, blockerId), eq(memberBlocks.blockedId, target.userId))
  if (on) {
    await db.transaction(async (tx) => {
      await tx.insert(memberBlocks).values({ blockerId, blockedId: target.userId, createdAt: now }).onConflictDoNothing()
      await tx
        .delete(memberFollows)
        .where(
          or(
            and(eq(memberFollows.followerId, blockerId), eq(memberFollows.followeeId, target.userId)),
            and(eq(memberFollows.followerId, target.userId), eq(memberFollows.followeeId, blockerId)),
          ),
        )
    })
  } else {
    await db.delete(memberBlocks).where(pair)
  }
  return { status: 'done', blocked: on }
}

/** 「屏蔽的人」in the settings: whom the member blocked, the latest first. */
export async function blockedPeople(payload: Payload, blockerId: string): Promise<BlockedPerson[]> {
  const rows = await drizzleOf(payload)
    .select({ userId: authUsers.id, name: authUsers.name, handle: authUsers.handle, blockedAt: memberBlocks.createdAt })
    .from(memberBlocks)
    .innerJoin(authUsers, eq(authUsers.id, memberBlocks.blockedId))
    .where(eq(memberBlocks.blockerId, blockerId))
    .orderBy(desc(memberBlocks.id))
    .limit(profileRules.blockedListed)
  return rows.flatMap((row) =>
    row.handle ? [{ name: cleanName(row.name), tone: toneFor(row.userId), handle: row.handle, blockedAt: row.blockedAt.toISOString() }] : [],
  )
}
