import type { Endpoint, PayloadRequest } from 'payload'

import { logAdminAction } from '@/lib/admin-log/hooks'

import { setAgentDisabled } from './admin'
import { parseId, parseReason } from './rules'

/** What the back office can do to an agent, as the admin log names it (`agents:disable`). */
export const agentAdminActions = ['disable', 'restore'] as const
type AgentAdminAction = (typeof agentAdminActions)[number]

const isAction = (value: unknown): value is AgentAdminAction => typeof value === 'string' && (agentAdminActions as readonly string[]).includes(value)

async function jsonOf(req: PayloadRequest): Promise<unknown> {
  try {
    return await req.json?.()
  } catch {
    return {}
  }
}

/**
 * The back office's endpoints for agents, for admins only (the「Agent」page). Agents live in their
 * own tables rather than a collection, so these are the site's own endpoints, under /api/agents, and
 * write their admin log row themselves.
 */
export const agentEndpoints: Endpoint[] = [
  {
    // POST /api/agents/:id/disable { reason } — its keys answer 401 from the next request on; POST /api/agents/:id/restore.
    path: '/agents/:id/:action',
    method: 'post',
    custom: { adminLogActions: agentAdminActions.map((action) => `agents:${action}`) },
    handler: async (req) => {
      if ((req.user as { collection?: string } | null)?.collection !== 'admins') return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const id = parseId(req.routeParams?.id)
      const action = req.routeParams?.action
      if (!id || !isAction(action)) return Response.json({ error: 'Not found' }, { status: 404 })
      const reason = action === 'disable' ? parseReason(await jsonOf(req)) : null
      if (reason === undefined) return Response.json({ error: 'Reason too long' }, { status: 400 })
      const agent = await setAgentDisabled(req.payload, id, action === 'disable' ? { reason } : null, new Date())
      if (!agent) return Response.json({ error: 'Not found' }, { status: 404 })
      await logAdminAction(req, {
        action: `agents:${action}`,
        target: 'agents',
        docId: String(id),
        docTitle: agent.name,
        // The reason is the admin's own words: kept on the agent, not in the log.
        ...(reason ? { detail: { omitted: ['reason'] } } : {}),
      })
      return Response.json({ ok: true })
    },
  },
]
