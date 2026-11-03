import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate } from '@/lib/shanghai-day'
import { siteUrl } from '@/lib/site-url'
import { clientIp, visitorHash } from '@/lib/visitor'

import { countRequest, resolveKey, touchKey, type AgentCaller } from './data'
import { bearerKey, tooManyRequests, unauthorized } from './http'

/**
 * The door to the open API and MCP (docs/specs/agents.md rules 4 and 7): who is calling (the agent
 * behind an `Authorization: Bearer ifai_…` key, or a visitor) and whether they may call now.
 * Sign-in cookies are never read here, so another site cannot act through a reader's browser.
 */

export type Admission = { caller: AgentCaller | null } | { response: Response }

/** A visitor without a key, by the day's visitor hash: the raw address is not kept. */
function visitorOf(request: Request, now: Date): string {
  return visitorHash({
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent')?.trim() ?? '',
    day: shanghaiDate(now),
    secret: process.env.PAYLOAD_SECRET ?? '',
  })
}

/**
 * Lets a request in or answers it: 401 for a key that does not work (never quietly read as a
 * visitor, so the agent learns its key is gone), 429 past the limit for its agent or visitor.
 */
export async function admit(request: Request, now: Date = new Date()): Promise<Admission> {
  const header = request.headers.get('authorization')
  const origin = siteUrl()
  const { payload } = await getDb()
  let caller: AgentCaller | null = null
  if (header !== null) {
    const key = bearerKey(header)
    if (!key) return { response: unauthorized('malformed', origin) }
    const found = await resolveKey(payload, key, now)
    if (typeof found === 'string') return { response: unauthorized(found, origin) }
    caller = found
  }
  const [counted] = await Promise.all([
    countRequest(payload, caller ? `a:${caller.agent.id}` : `v:${visitorOf(request, now)}`, now),
    caller ? touchKey(payload, caller.keyId, clientIp(request.headers), now) : null,
  ])
  if (!counted.ok) return { response: tooManyRequests(counted.retryAfter) }
  return { caller }
}
