import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, asc, count, desc, eq, inArray, lt, or, isNull, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'

import { hashKey, newKey } from './keys'
import { agentRules, keyHint, sameName, type AgentInput, type AgentView, type KeyInput, type KeyScope, type KeyView } from './rules'
import { agentKeys, agents, apiRequests } from './schema'

/**
 * A member's agents and their keys (docs/specs/agents.md「Agent 身份与密钥」): what the settings
 * page reads and changes, and how the open API and MCP find the agent behind a key.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

type AgentRow = typeof agents.$inferSelect
type KeyRow = typeof agentKeys.$inferSelect

const DAY_MS = 24 * 60 * 60 * 1000

function keyView(row: KeyRow): KeyView {
  return {
    id: row.id,
    label: row.label,
    hint: row.hint,
    scope: row.scope,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: row.lastUsedIp,
  }
}

function agentView(row: AgentRow, keys: KeyRow[]): AgentView {
  return {
    id: row.id,
    name: row.name,
    about: row.about,
    createdAt: row.createdAt.toISOString(),
    disabled: row.disabledAt ? { at: row.disabledAt.toISOString(), reason: row.disabledReason } : null,
    keys: keys.map(keyView),
  }
}

/** A member's agents in the order they made them, each with its keys, newest first. */
export async function memberAgents(payload: Payload, userId: string): Promise<AgentView[]> {
  const db = drizzleOf(payload)
  const rows = await db.select().from(agents).where(eq(agents.userId, userId)).orderBy(asc(agents.createdAt), asc(agents.id))
  if (!rows.length) return []
  const keys = await db
    .select()
    .from(agentKeys)
    .where(
      inArray(
        agentKeys.agentId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(desc(agentKeys.createdAt), desc(agentKeys.id))
  return rows.map((row) =>
    agentView(
      row,
      keys.filter((key) => key.agentId === row.id),
    ),
  )
}

export type CreateAgentResult = { ok: true; agent: AgentView } | { ok: false; error: 'unverified' | 'too-many-agents' | 'name-taken' }

/**
 * A new agent for a member whose email IFAI has seen work (rule 5): someone answers for every
 * agent. The member's row is locked while counting, so two quick submits cannot make a fourth.
 */
export async function createAgent(payload: Payload, member: { id: string; emailVerified: boolean }, input: AgentInput): Promise<CreateAgentResult> {
  if (!member.emailVerified) return { ok: false, error: 'unverified' }
  return drizzleOf(payload).transaction(async (tx) => {
    await tx.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.id, member.id)).for('update')
    const mine = await tx.select({ name: agents.name }).from(agents).where(eq(agents.userId, member.id))
    if (mine.length >= agentRules.maxAgents) return { ok: false, error: 'too-many-agents' } as const
    if (mine.some((agent) => sameName(agent.name, input.name))) return { ok: false, error: 'name-taken' } as const
    const [row] = await tx.insert(agents).values({ userId: member.id, name: input.name, about: input.about }).returning()
    return { ok: true, agent: agentView(row, []) } as const
  })
}

/** Renames an agent or changes its introduction; only its owner can. */
export async function updateAgent(payload: Payload, userId: string, agentId: number, input: AgentInput): Promise<'ok' | 'not-found' | 'name-taken'> {
  const db = drizzleOf(payload)
  const mine = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.userId, userId))
  if (!mine.some((agent) => agent.id === agentId)) return 'not-found'
  if (mine.some((agent) => agent.id !== agentId && sameName(agent.name, input.name))) return 'name-taken'
  await db
    .update(agents)
    .set({ name: input.name, about: input.about })
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
  return 'ok'
}

/** Deletes one of the member's agents, and its keys with it. */
export async function deleteAgent(payload: Payload, userId: string, agentId: number): Promise<boolean> {
  const deleted = await drizzleOf(payload)
    .delete(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .returning({ id: agents.id })
  return deleted.length > 0
}

export type CreateKeyResult = { ok: true; key: string; view: KeyView } | { ok: false; error: 'not-found' | 'disabled' | 'too-many-keys' }

/** A new key for one of the member's agents. The key itself is in the answer and nowhere else. */
export async function createKey(payload: Payload, userId: string, agentId: number, input: KeyInput, now: Date): Promise<CreateKeyResult> {
  return drizzleOf(payload).transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id, disabledAt: agents.disabledAt })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
      .for('update')
    if (!agent) return { ok: false, error: 'not-found' } as const
    if (agent.disabledAt) return { ok: false, error: 'disabled' } as const
    const [{ held }] = await tx.select({ held: count() }).from(agentKeys).where(eq(agentKeys.agentId, agentId))
    if (held >= agentRules.maxKeys) return { ok: false, error: 'too-many-keys' } as const
    const key = newKey()
    const [row] = await tx
      .insert(agentKeys)
      .values({
        agentId,
        label: input.label,
        hint: keyHint(key),
        hash: hashKey(key),
        scope: input.scope,
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.days * DAY_MS),
      })
      .returning()
    return { ok: true, key, view: keyView(row) } as const
  })
}

/** Deletes one key of one of the member's agents: anything still using it gets 401 from then on. */
export async function deleteKey(payload: Payload, userId: string, agentId: number, keyId: number): Promise<boolean> {
  const db = drizzleOf(payload)
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
  if (!agent) return false
  const deleted = await db
    .delete(agentKeys)
    .where(and(eq(agentKeys.id, keyId), eq(agentKeys.agentId, agentId)))
    .returning({ id: agentKeys.id })
  return deleted.length > 0
}

/** The agent behind a working key, as the open API and MCP act for it. Names are its owner's own words. */
export type AgentCaller = {
  keyId: number
  scope: KeyScope
  expiresAt: string
  agent: { id: number; name: string; about: string | null }
  owner: { id: string; name: string }
}

export type KeyProblem = 'unknown' | 'expired' | 'disabled'

/** Who a key acts for, or why it does not work. */
export async function resolveKey(payload: Payload, key: string, now: Date): Promise<AgentCaller | KeyProblem> {
  const [row] = await drizzleOf(payload)
    .select({
      keyId: agentKeys.id,
      scope: agentKeys.scope,
      expiresAt: agentKeys.expiresAt,
      agentId: agents.id,
      name: agents.name,
      about: agents.about,
      disabledAt: agents.disabledAt,
      ownerId: authUsers.id,
      ownerName: authUsers.name,
    })
    .from(agentKeys)
    .innerJoin(agents, eq(agents.id, agentKeys.agentId))
    .innerJoin(authUsers, eq(authUsers.id, agents.userId))
    .where(eq(agentKeys.hash, hashKey(key)))
    .limit(1)
  if (!row) return 'unknown'
  if (row.disabledAt) return 'disabled'
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired'
  return {
    keyId: row.keyId,
    scope: row.scope,
    expiresAt: row.expiresAt.toISOString(),
    agent: { id: row.agentId, name: row.name, about: row.about },
    owner: { id: row.ownerId, name: row.ownerName },
  }
}

/** Notes when and from where a key was last used, at most once a minute, for its owner's settings page. */
export async function touchKey(payload: Payload, keyId: number, ip: string, now: Date): Promise<void> {
  await drizzleOf(payload)
    .update(agentKeys)
    .set({ lastUsedAt: now, lastUsedIp: ip || null })
    .where(and(eq(agentKeys.id, keyId), or(isNull(agentKeys.lastUsedAt), lt(agentKeys.lastUsedAt, new Date(now.getTime() - 60_000)))))
}

/** The start of the minute `now` is in: requests are counted per minute. */
export function minuteOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000)
}

/**
 * Counts one request by `caller` (`a:<agent id>` or `v:<visitor hash>`) in this minute. Over the
 * limit, says how many seconds are left until the next minute starts.
 */
export async function countRequest(payload: Payload, caller: string, now: Date): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const minute = minuteOf(now)
  const [row] = await drizzleOf(payload)
    .insert(apiRequests)
    .values({ caller, minute, count: 1 })
    .onConflictDoUpdate({ target: [apiRequests.caller, apiRequests.minute], set: { count: sql`${apiRequests.count} + 1` } })
    .returning({ count: apiRequests.count })
  if (row.count <= agentRules.perMinute) return { ok: true }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((minute.getTime() + 60_000 - now.getTime()) / 1000)) }
}

/**
 * The daily clean-up: request counts older than two days (the back office shows today's), and
 * keys that ran out more than 30 days ago, which their owners have had time to replace.
 */
export async function cleanUpAgents(payload: Payload, now: Date): Promise<{ requests: number; keys: number }> {
  const db = drizzleOf(payload)
  const requests = await db.delete(apiRequests).where(lt(apiRequests.minute, new Date(now.getTime() - 2 * DAY_MS)))
  const keys = await db.delete(agentKeys).where(lt(agentKeys.expiresAt, new Date(now.getTime() - 30 * DAY_MS)))
  return { requests: requests.rowCount ?? 0, keys: keys.rowCount ?? 0 }
}
