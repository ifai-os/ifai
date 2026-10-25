import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, gte, inArray, isNull, lt } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import { authUsers } from '@/lib/auth/schema'
import { detectLanguage } from '@/lib/i18n/detect'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { cleanName } from '@/modules/apps/reviews/rules'

import { blockedAmong, blockedBetween } from './blocks'
import {
  checkHandle,
  nextHandleChange,
  profileRules,
  type FollowChange,
  type HandleError,
  type PeopleSide,
  type PersonRow,
  type ProfileInput,
  type ProfileSettings,
  type ProfileView,
} from './rules'
import { memberFollows, memberOldHandles, memberProfiles } from './schema'

/**
 * Reading and writing profiles and follows (docs/specs/circles.md rules 18–20) for the pages and
 * src/app/api/account/profile, src/app/api/follows/members. Works on the Payload instance it is given and
 * stays free of the Payload config, like the circles module's ./data.ts.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** Postgres refused a row that would repeat a unique value. */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) => (value && typeof value === 'object' && 'code' in value ? value.code : undefined)
  return codeOf(error) === '23505' || codeOf(error && typeof error === 'object' && 'cause' in error ? error.cause : undefined) === '23505'
}

export type FoundMember = { userId: string; handle: string; moved: boolean }

/**
 * The member an address belongs to: whose it is now or, when it is one they had before (`moved`),
 * who has it kept and under which address they are now. One the site owner took away leads nowhere.
 */
export async function findByHandle(payload: Payload, handle: string): Promise<FoundMember | null> {
  const db = drizzleOf(payload)
  const [current] = await db.select({ id: authUsers.id, handle: authUsers.handle }).from(authUsers).where(eq(authUsers.handle, handle)).limit(1)
  if (current?.handle) return { userId: current.id, handle: current.handle, moved: false }
  const [old] = await db
    .select({ id: authUsers.id, handle: authUsers.handle })
    .from(memberOldHandles)
    .innerJoin(authUsers, eq(authUsers.id, memberOldHandles.userId))
    .where(and(eq(memberOldHandles.handle, handle), isNull(memberOldHandles.retiredAt)))
    .limit(1)
  return old?.handle ? { userId: old.id, handle: old.handle, moved: true } : null
}

type ProfileRow = {
  userId: string
  name: string
  handle: string | null
  createdAt: Date
  bio: string | null
  bioLang: string | null
  website: string | null
  handleChangedAt: Date | null
}

async function profileRow(payload: Payload, userId: string): Promise<ProfileRow | null> {
  const [row] = await drizzleOf(payload)
    .select({
      userId: authUsers.id,
      name: authUsers.name,
      handle: authUsers.handle,
      createdAt: authUsers.createdAt,
      bio: memberProfiles.bio,
      bioLang: memberProfiles.bioLang,
      website: memberProfiles.website,
      handleChangedAt: memberProfiles.handleChangedAt,
    })
    .from(authUsers)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, authUsers.id))
    .where(eq(authUsers.id, userId))
    .limit(1)
  return row ?? null
}

/** A member's profile as their page shows it; null when they have no address yet. */
export async function profileView(payload: Payload, userId: string): Promise<ProfileView | null> {
  const row = await profileRow(payload, userId)
  if (!row?.handle) return null
  return {
    name: cleanName(row.name),
    tone: toneFor(row.userId),
    handle: row.handle,
    bio: row.bio ?? '',
    bioLang: row.bioLang,
    website: row.website,
    joinedAt: row.createdAt.toISOString(),
  }
}

/** What the settings form starts from; null when the member has no address yet. */
export async function profileSettings(payload: Payload, userId: string, now = new Date()): Promise<ProfileSettings | null> {
  const row = await profileRow(payload, userId)
  if (!row?.handle) return null
  return {
    handle: row.handle,
    bio: row.bio ?? '',
    website: row.website,
    nextChange: nextHandleChange(row.handleChangedAt, now)?.toISOString() ?? null,
  }
}

export type SaveProfileResult =
  | { status: 'saved'; profile: ProfileSettings }
  | { status: HandleError | 'handle-taken' | 'not-found' }
  | { status: 'handle-too-soon'; nextChange: string }

/**
 * Saves the fields the member sent (rules 18 and 19). A new address must be free: nobody has it
 * now and nobody had it before, unless it was theirs and the site owner did not take it away
 * (rule 24); the first change is free, then one every `handleChangeDays`. The old address is kept
 * for them, so it keeps leading to their page.
 */
export async function saveProfile(payload: Payload, userId: string, input: ProfileInput, now = new Date()): Promise<SaveProfileResult> {
  const db = drizzleOf(payload)
  const current = await profileRow(payload, userId)
  if (!current?.handle) return { status: 'not-found' }
  const oldHandle = current.handle
  const handle = input.handle !== undefined && input.handle !== oldHandle ? input.handle : null

  if (handle !== null) {
    const checked = checkHandle(handle)
    if (!checked.ok) return { status: checked.error }
    const next = nextHandleChange(current.handleChangedAt, now)
    if (next) return { status: 'handle-too-soon', nextChange: next.toISOString() }
    const [kept] = await db
      .select({ userId: memberOldHandles.userId, retiredAt: memberOldHandles.retiredAt })
      .from(memberOldHandles)
      .where(eq(memberOldHandles.handle, handle))
      .limit(1)
    if (kept?.retiredAt) return { status: 'reserved-handle' }
    if (kept && kept.userId !== userId) return { status: 'handle-taken' }
  }

  const values: Partial<typeof memberProfiles.$inferInsert> = {}
  if (input.bio !== undefined) {
    values.bio = input.bio
    values.bioLang = input.bio ? detectLanguage(input.bio, input.locale) : null
  }
  if (input.website !== undefined) values.website = input.website
  if (handle !== null) values.handleChangedAt = now

  try {
    await db.transaction(async (tx) => {
      if (handle !== null) {
        await tx.insert(memberOldHandles).values({ handle: oldHandle, userId, createdAt: now }).onConflictDoNothing()
        // Taking back an address of their own.
        await tx.delete(memberOldHandles).where(and(eq(memberOldHandles.handle, handle), eq(memberOldHandles.userId, userId)))
        await tx.update(authUsers).set({ handle }).where(eq(authUsers.id, userId))
      }
      if (Object.keys(values).length > 0) {
        await tx
          .insert(memberProfiles)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: memberProfiles.userId, set: values })
      }
    })
  } catch (error) {
    // Someone took the address a moment before.
    if (handle !== null && isUniqueViolation(error)) return { status: 'handle-taken' }
    throw error
  }

  const profile = await profileSettings(payload, userId, now)
  return profile ? { status: 'saved', profile } : { status: 'not-found' }
}

/** How many people the member follows and how many follow them. */
export async function followCounts(payload: Payload, userId: string): Promise<{ following: number; followers: number }> {
  const db = drizzleOf(payload)
  const [[following], [followers]] = await Promise.all([
    db.select({ count: count() }).from(memberFollows).where(eq(memberFollows.followerId, userId)),
    db.select({ count: count() }).from(memberFollows).where(eq(memberFollows.followeeId, userId)),
  ])
  return { following: Number(following?.count ?? 0), followers: Number(followers?.count ?? 0) }
}

/** Which of these members the reader follows. */
export async function followedAmong(payload: Payload, followerId: string | null, userIds: string[]): Promise<Set<string>> {
  if (!followerId || userIds.length === 0) return new Set()
  const rows = await drizzleOf(payload)
    .select({ id: memberFollows.followeeId })
    .from(memberFollows)
    .where(and(eq(memberFollows.followerId, followerId), inArray(memberFollows.followeeId, [...new Set(userIds)])))
  return new Set(rows.map((row) => row.id))
}

export type FollowResult = { status: 'done'; change: FollowChange } | { status: 'not-found' | 'own-profile' | 'daily-limit' | 'too-many' | 'blocked' }

/**
 * Follows the member at `handle` (one they had before also works) or stops following them.
 * Following again someone already followed changes nothing; a new follow counts towards
 * `dailyFollows` a Shanghai day and `maxFollowing` in all (rule 20). Nobody follows someone they
 * blocked or who blocked them (rule 23).
 */
export async function setFollow(
  payload: Payload,
  change: { followerId: string; handle: string; on: boolean },
  now = new Date(),
): Promise<FollowResult> {
  const { followerId, handle, on } = change
  const target = await findByHandle(payload, handle)
  if (!target) return { status: 'not-found' }
  if (target.userId === followerId) return { status: 'own-profile' }
  const db = drizzleOf(payload)
  const pair = and(eq(memberFollows.followerId, followerId), eq(memberFollows.followeeId, target.userId))
  if (on) {
    if (await blockedBetween(payload, followerId, target.userId)) return { status: 'blocked' }
    const [existing] = await db.select({ id: memberFollows.id }).from(memberFollows).where(pair).limit(1)
    if (!existing) {
      const [[today], [total]] = await Promise.all([
        db
          .select({ count: count() })
          .from(memberFollows)
          .where(and(eq(memberFollows.followerId, followerId), gte(memberFollows.createdAt, shanghaiDayStart(now)))),
        db.select({ count: count() }).from(memberFollows).where(eq(memberFollows.followerId, followerId)),
      ])
      if (Number(total?.count ?? 0) >= profileRules.maxFollowing) return { status: 'too-many' }
      if (Number(today?.count ?? 0) >= profileRules.dailyFollows) return { status: 'daily-limit' }
      await db.insert(memberFollows).values({ followerId, followeeId: target.userId, createdAt: now }).onConflictDoNothing()
    }
  } else {
    await db.delete(memberFollows).where(pair)
  }
  const { followers } = await followCounts(payload, target.userId)
  return { status: 'done', change: { following: on, followers } }
}

/**
 * One page of the people who follow the member (`followers`) or whom they follow (`following`),
 * the latest first, after the follow `before` when given; each says whether the reader follows
 * them and whether one of the two blocked the other.
 */
export async function peoplePage(
  payload: Payload,
  { userId, side, readerId, before }: { userId: string; side: PeopleSide; readerId: string | null; before: number | null },
): Promise<{ people: PersonRow[]; next: number | null }> {
  const db = drizzleOf(payload)
  const size = profileRules.peoplePageSize
  const listed = side === 'followers' ? memberFollows.followerId : memberFollows.followeeId
  const owner = side === 'followers' ? memberFollows.followeeId : memberFollows.followerId
  const rows = await db
    .select({
      followId: memberFollows.id,
      userId: authUsers.id,
      name: authUsers.name,
      handle: authUsers.handle,
      bio: memberProfiles.bio,
      bioLang: memberProfiles.bioLang,
    })
    .from(memberFollows)
    .innerJoin(authUsers, eq(authUsers.id, listed))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, authUsers.id))
    .where(and(eq(owner, userId), before ? lt(memberFollows.id, before) : undefined))
    .orderBy(desc(memberFollows.id))
    .limit(size + 1)
  const page = rows.slice(0, size)
  const ids = page.map((row) => row.userId)
  const [followed, blocked] = await Promise.all([followedAmong(payload, readerId, ids), blockedAmong(payload, readerId, ids)])
  return {
    people: page.flatMap((row) =>
      row.handle
        ? [
            {
              name: cleanName(row.name),
              tone: toneFor(row.userId),
              handle: row.handle,
              bio: row.bio ?? '',
              bioLang: row.bioLang,
              following: followed.has(row.userId),
              self: row.userId === readerId,
              blocked: blocked.has(row.userId),
            },
          ]
        : [],
    ),
    next: rows.length > size ? page[page.length - 1].followId : null,
  }
}
