import { getDb } from '@/lib/db/drizzle'
import { bodyOf, fail, memberOf, reply } from '@/modules/agents/account-api'
import { createAgent } from '@/modules/agents/data'
import { parseAgentInput } from '@/modules/agents/rules'

// One member's own agents: never rendered ahead or cached.
export const dynamic = 'force-dynamic'

/**
 * POST /api/account/agents { name, about } → 201 { agent }: a new agent for the signed-in member
 * (「设置 · Agent」, docs/specs/agents.md). At most three, each under its own name, and only for a
 * member whose sign-in email works (rule 5).
 */
export async function POST(request: Request) {
  const member = await memberOf(request)
  if ('response' in member) return member.response
  const input = parseAgentInput(await bodyOf(request))
  if (!input.ok) return fail(input.error, 400)
  const { payload } = await getDb()
  const { user } = member.session
  const result = await createAgent(payload, { id: user.id, emailVerified: user.emailVerified }, input.value)
  if (!result.ok) return fail(result.error, result.error === 'unverified' ? 403 : 409)
  return reply({ agent: result.agent }, 201)
}
