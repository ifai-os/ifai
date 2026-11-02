import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, gte, inArray, isNotNull, max, sql, type SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { agentWrites } from '@/modules/circles/data'

import type { AdminAgentFilters } from './rules'
import { agentKeys, agents, apiRequests } from './schema'

/**
 * The back office's「Agent」page (docs/specs/agents.md「后台」): every agent with its owner, keys,
 * last use, today's requests and what it wrote in the circles today, and turning one off or back on.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export const ADMIN_PAGE_SIZE = 50

export type AdminAgent = {
  id: number
  name: string
  about: string | null
  createdAt: string
  owner: { id: string; name: string; email: string }
  /** Keys it holds, those that still work, and those of them that can write. */
  keys: { total: number; working: number; write: number }
  lastUsedAt: string | null
  /** Requests to the open API and MCP since midnight in Shanghai. */
  requestsToday: number
  /** Posts and reactions it made in the circles since midnight in Shanghai. */
  writesToday: { posts: number; reactions: number }
  disabled: { at: string; reason: string | null } | null
}

export type AdminAgentsPage = {
  agents: AdminAgent[]
  total: number
  pages: number
  /** Across all agents: how many, how many are turned off, and today's requests with and without a key. */
  summary: { agents: number; disabled: number; agentRequests: number; visitorRequests: number }
}

const number = (value: unknown) => Number(value ?? 0) || 0

export async function adminAgents(payload: Payload, filters: AdminAgentFilters, now: Date): Promise<AdminAgentsPage> {
  const db = drizzleOf(payload)
  const today = shanghaiDayStart(now)
  const where: SQL[] = []
  if (filters.agent) where.push(eq(agents.id, filters.agent))
  if (filters.disabled) where.push(isNotNull(agents.disabledAt))
  const condition = where.length ? and(...where) : undefined

  const [rows, [{ total }], [summary], [usage]] = await Promise.all([
    db
      .select({
        id: agents.id,
        name: agents.name,
        about: agents.about,
        createdAt: agents.createdAt,
        disabledAt: agents.disabledAt,
        disabledReason: agents.disabledReason,
        ownerId: authUsers.id,
        ownerName: authUsers.name,
        ownerEmail: authUsers.email,
      })
      .from(agents)
      .innerJoin(authUsers, eq(authUsers.id, agents.userId))
      .where(condition)
      .orderBy(desc(agents.createdAt), desc(agents.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    db.select({ total: count() }).from(agents).where(condition),
    db.select({ agents: count(), disabled: sql<string>`count(*) filter (where ${agents.disabledAt} is not null)` }).from(agents),
    db
      .select({
        agentRequests: sql<string | null>`sum(${apiRequests.count}) filter (where ${apiRequests.caller} like 'a:%')`,
        visitorRequests: sql<string | null>`sum(${apiRequests.count}) filter (where ${apiRequests.caller} like 'v:%')`,
      })
      .from(apiRequests)
      .where(gte(apiRequests.minute, today)),
  ])

  const ids = rows.map((row) => row.id)
  const [keys, requests, writes] = ids.length
    ? await Promise.all([
        db
          .select({
            agentId: agentKeys.agentId,
            total: count(),
            working: sql<string>`count(*) filter (where ${agentKeys.expiresAt} > ${now})`,
            write: sql<string>`count(*) filter (where ${agentKeys.expiresAt} > ${now} and ${agentKeys.scope} = 'write')`,
            lastUsedAt: max(agentKeys.lastUsedAt),
          })
          .from(agentKeys)
          .where(inArray(agentKeys.agentId, ids))
          .groupBy(agentKeys.agentId),
        db
          .select({ caller: apiRequests.caller, requests: sql<string>`sum(${apiRequests.count})` })
          .from(apiRequests)
          .where(
            and(
              gte(apiRequests.minute, today),
              inArray(
                apiRequests.caller,
                ids.map((id) => `a:${id}`),
              ),
            ),
          )
          .groupBy(apiRequests.caller),
        agentWrites(payload, ids, today),
      ])
    : [[], [], new Map<number, { posts: number; reactions: number }>()]

  return {
    agents: rows.map((row) => {
      const held = keys.find((key) => key.agentId === row.id)
      const lastUsedAt = held?.lastUsedAt ? new Date(held.lastUsedAt) : null
      return {
        id: row.id,
        name: row.name,
        about: row.about,
        createdAt: row.createdAt.toISOString(),
        owner: { id: row.ownerId, name: row.ownerName, email: row.ownerEmail },
        keys: { total: number(held?.total), working: number(held?.working), write: number(held?.write) },
        lastUsedAt: lastUsedAt?.toISOString() ?? null,
        requestsToday: number(requests.find((item) => item.caller === `a:${row.id}`)?.requests),
        writesToday: writes.get(row.id) ?? { posts: 0, reactions: 0 },
        disabled: row.disabledAt ? { at: row.disabledAt.toISOString(), reason: row.disabledReason } : null,
      }
    }),
    total: number(total),
    pages: Math.max(1, Math.ceil(number(total) / ADMIN_PAGE_SIZE)),
    summary: {
      agents: number(summary?.agents),
      disabled: number(summary?.disabled),
      agentRequests: number(usage?.agentRequests),
      visitorRequests: number(usage?.visitorRequests),
    },
  }
}

/**
 * Turns an agent off, with a reason its owner sees (its keys answer 401 from the next request on),
 * or back on. Null when there is no such agent.
 */
export async function setAgentDisabled(payload: Payload, agentId: number, off: { reason: string | null } | null, now: Date): Promise<{ name: string } | null> {
  const [row] = await drizzleOf(payload)
    .update(agents)
    .set(off ? { disabledAt: now, disabledReason: off.reason } : { disabledAt: null, disabledReason: null })
    .where(eq(agents.id, agentId))
    .returning({ name: agents.name })
  return row ?? null
}
