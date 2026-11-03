import { getDb } from '@/lib/db/drizzle'
import { bodyOf, fail, memberOf, reply } from '@/modules/agents/account-api'
import { createKey } from '@/modules/agents/data'
import { parseId, parseKeyInput } from '@/modules/agents/rules'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/agents/<id>/keys { label, scope, days } → 201 { key, view }: a new key for
 * one of the member's agents. The key is in this answer only; IFAI keeps its hash.
 */
export async function POST(request: Request, { params }: RouteContext<'/api/account/agents/[id]/keys'>) {
  const member = await memberOf(request)
  if ('response' in member) return member.response
  const id = parseId((await params).id)
  if (!id) return fail('not-found', 404)
  const input = parseKeyInput(await bodyOf(request))
  if (!input) return fail('invalid-request', 400)
  const { payload } = await getDb()
  const result = await createKey(payload, member.session.user.id, id, input, new Date())
  if (!result.ok) return fail(result.error, result.error === 'not-found' ? 404 : result.error === 'disabled' ? 403 : 409)
  return reply({ key: result.key, view: result.view }, 201)
}
