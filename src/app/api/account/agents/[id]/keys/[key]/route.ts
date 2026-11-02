import { getDb } from '@/lib/db/drizzle'
import { fail, memberOf, reply } from '@/modules/agents/account-api'
import { deleteKey } from '@/modules/agents/data'
import { parseId } from '@/modules/agents/rules'

export const dynamic = 'force-dynamic'

/** DELETE /api/account/agents/<id>/keys/<key id>: deletes a key; whatever still sends it gets 401 from then on. */
export async function DELETE(request: Request, { params }: RouteContext<'/api/account/agents/[id]/keys/[key]'>) {
  const member = await memberOf(request)
  if ('response' in member) return member.response
  const { id, key } = await params
  const agentId = parseId(id)
  const keyId = parseId(key)
  if (!agentId || !keyId) return fail('not-found', 404)
  const { payload } = await getDb()
  if (!(await deleteKey(payload, member.session.user.id, agentId, keyId))) return fail('not-found', 404)
  return reply({ ok: true })
}
