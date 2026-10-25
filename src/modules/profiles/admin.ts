import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, inArray, isNull, max, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'
import { cleanName } from '@/modules/apps/reviews/rules'

import { newHandle } from './handles'
import type { MemberReportAction, MemberReportReason } from './rules'
import { memberOldHandles, memberProfiles, memberReports } from './schema'

/**
 * What the back office reads and changes about reported members (docs/specs/circles.md rule 24):
 * the members with reports nobody has dealt with, and dealing with them. Free of the Payload
 * config, so the circles collection (through ./endpoints) can import it.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** A member with reports nobody has dealt with, and what they show of themselves now. */
export type OpenMemberReport = {
  userId: string
  name: string
  email: string
  handle: string | null
  bio: string
  bioLang: string | null
  website: string | null
  /** Open reports, and how many of them give each reason. */
  reports: number
  reasons: Partial<Record<MemberReportReason, number>>
  lastReportedAt: string
}

/** Members with open reports, most recently reported first, at most `limit` of them; `total` counts them all. */
export async function openMemberReports(payload: Payload, limit = 20): Promise<{ total: number; members: OpenMemberReport[] }> {
  const db = drizzleOf(payload)
  const open = isNull(memberReports.resolvedAt)
  const [rows, [total]] = await Promise.all([
    db
      .select({ userId: memberReports.userId, reports: count(), lastReportedAt: max(memberReports.createdAt) })
      .from(memberReports)
      .where(open)
      .groupBy(memberReports.userId)
      .orderBy(desc(max(memberReports.createdAt)))
      .limit(limit),
    db
      .select({ count: sql<number>`count(distinct ${memberReports.userId})`.mapWith(Number) })
      .from(memberReports)
      .where(open),
  ])
  if (rows.length === 0) return { total: 0, members: [] }

  const ids = rows.map((row) => row.userId)
  const [people, reasons] = await Promise.all([
    db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        handle: authUsers.handle,
        bio: memberProfiles.bio,
        bioLang: memberProfiles.bioLang,
        website: memberProfiles.website,
      })
      .from(authUsers)
      .leftJoin(memberProfiles, eq(memberProfiles.userId, authUsers.id))
      .where(inArray(authUsers.id, ids)),
    db
      .select({ userId: memberReports.userId, reason: memberReports.reason, count: count() })
      .from(memberReports)
      .where(and(open, inArray(memberReports.userId, ids)))
      .groupBy(memberReports.userId, memberReports.reason),
  ])
  const personOf = new Map(people.map((person) => [person.id, person]))
  return {
    total: total?.count ?? rows.length,
    members: rows.flatMap((row) => {
      const person = personOf.get(row.userId)
      if (!person) return []
      return [
        {
          userId: row.userId,
          name: cleanName(person.name),
          email: person.email,
          handle: person.handle,
          bio: person.bio ?? '',
          bioLang: person.bioLang,
          website: person.website,
          reports: Number(row.reports),
          reasons: Object.fromEntries(reasons.filter((item) => item.userId === row.userId).map((item) => [item.reason, Number(item.count)])),
          lastReportedAt: (row.lastReportedAt ?? new Date(0)).toISOString(),
        },
      ]
    }),
  }
}

/** Postgres refused a row that would repeat a unique value. */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) => (value && typeof value === 'object' && 'code' in value ? value.code : undefined)
  return codeOf(error) === '23505' || codeOf(error && typeof error === 'object' && 'cause' in error ? error.cause : undefined) === '23505'
}

/**
 * Deals with a reported member (rule 24): clears their line and site, gives them a new address of
 * the kind IFAI gives (the one taken away leads nowhere and nobody can have it again; they may
 * choose another at once), clears their name (「IFAI 读者」), any of these together; or keeps them
 * as they are. Either way their open reports are closed. False when there is no such member.
 */
export async function handleMemberReports(payload: Payload, userId: string, action: MemberReportAction, now = new Date()): Promise<boolean> {
  const db = drizzleOf(payload)
  const [member] = await db.select({ handle: authUsers.handle }).from(authUsers).where(eq(authUsers.id, userId)).limit(1)
  if (!member) return false

  if (!('keep' in action)) {
    for (let attempt = 0; ; attempt++) {
      try {
        await db.transaction(async (tx) => {
          if (action.clearProfile) {
            await tx.update(memberProfiles).set({ bio: '', bioLang: null, website: null }).where(eq(memberProfiles.userId, userId))
          }
          if (action.resetHandle && member.handle) {
            await tx
              .insert(memberOldHandles)
              .values({ handle: member.handle, userId, createdAt: now, retiredAt: now })
              .onConflictDoUpdate({ target: memberOldHandles.handle, set: { retiredAt: now } })
            await tx.update(authUsers).set({ handle: newHandle() }).where(eq(authUsers.id, userId))
            // A new address of their own choosing does not wait the thirty days.
            await tx.update(memberProfiles).set({ handleChangedAt: null }).where(eq(memberProfiles.userId, userId))
          }
          if (action.resetName) await tx.update(authUsers).set({ name: '' }).where(eq(authUsers.id, userId))
        })
        break
      } catch (error) {
        // The ten random digits matched someone's: draw again.
        if (action.resetHandle && attempt < 2 && isUniqueViolation(error)) continue
        throw error
      }
    }
  }

  await db
    .update(memberReports)
    .set({ resolvedAt: now })
    .where(and(eq(memberReports.userId, userId), isNull(memberReports.resolvedAt)))
  return true
}
