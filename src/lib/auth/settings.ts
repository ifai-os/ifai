import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, asc, desc, eq, gt } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { normalizeEmail } from '@/modules/daily/email/address'
import { tokenFor } from '@/modules/daily/email/links'

import { authAccounts, authSessions } from './schema'

/**
 * What the「设置」page shows about a member (docs/specs/account.md), read straight from the tables
 * like the data export: Better Auth's own session list wants a sign-in from the last day, and
 * looking at one's devices should not. Sign-in tokens never leave the server.
 */

export const socialProviders = ['google', 'github'] as const
export type SocialProvider = (typeof socialProviders)[number]

const isSocialProvider = (value: string): value is SocialProvider => (socialProviders as readonly string[]).includes(value)

/** A Google or GitHub account the member signs in with; `id` is Better Auth's own, for unlinking. */
export type LinkedAccount = { id: string; provider: SocialProvider; linkedAt: string }

/** One sign-in that has not run out, the one asking first. */
export type SignedInDevice = { id: string; userAgent: string | null; ipAddress: string | null; signedInAt: string; current: boolean }

/**
 * The daily email at the sign-in address: going out (or stopped, for a bounce or a complaint),
 * with the token of the manage page; or nothing to manage.
 */
export type DailyEmailState = { status: 'subscribed' | 'stopped'; token: string } | { status: 'none' }

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export async function linkedAccounts(payload: Payload, userId: string): Promise<LinkedAccount[]> {
  const rows = await drizzleOf(payload)
    .select({ id: authAccounts.id, providerId: authAccounts.providerId, createdAt: authAccounts.createdAt })
    .from(authAccounts)
    .where(eq(authAccounts.userId, userId))
    .orderBy(asc(authAccounts.createdAt))
  return rows.flatMap((row) => (isSocialProvider(row.providerId) ? [{ id: row.id, provider: row.providerId, linkedAt: row.createdAt.toISOString() }] : []))
}

export async function signedInDevices(payload: Payload, userId: string, currentSessionId: string, now: Date): Promise<SignedInDevice[]> {
  const rows = await drizzleOf(payload)
    .select({
      id: authSessions.id,
      userAgent: authSessions.userAgent,
      ipAddress: authSessions.ipAddress,
      createdAt: authSessions.createdAt,
    })
    .from(authSessions)
    .where(and(eq(authSessions.userId, userId), gt(authSessions.expiresAt, now)))
    .orderBy(desc(authSessions.createdAt))
  const devices = rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    signedInAt: row.createdAt.toISOString(),
    current: row.id === currentSessionId,
  }))
  return [...devices.filter((device) => device.current), ...devices.filter((device) => !device.current)]
}

/** The subscription goes by address, not by account: only an address the member has shown is theirs (as in the export). */
export async function dailyEmailState(payload: Payload, user: { email: string; emailVerified: boolean }): Promise<DailyEmailState> {
  if (!user.emailVerified) return { status: 'none' }
  const { docs } = await payload.find({
    collection: 'subscribers',
    where: { email: { equals: normalizeEmail(user.email) } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const subscriber = docs[0]
  if (!subscriber || subscriber.status === 'unsubscribed') return { status: 'none' }
  return { status: subscriber.status, token: tokenFor(subscriber.id) }
}

/**
 * The token of one of the member's other sign-ins, for signing it out; null when it is not
 * theirs or is the one asking (that one signs out from the menu).
 */
export async function otherSessionToken(payload: Payload, userId: string, sessionId: string, currentSessionId: string): Promise<string | null> {
  if (sessionId === currentSessionId) return null
  const [row] = await drizzleOf(payload)
    .select({ token: authSessions.token })
    .from(authSessions)
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)))
    .limit(1)
  return row?.token ?? null
}
