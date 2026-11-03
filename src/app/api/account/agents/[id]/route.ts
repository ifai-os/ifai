import { getDb } from '@/lib/db/drizzle'
import { bodyOf, fail, memberOf, reply } from '@/modules/agents/account-api'
import { deleteAgent, updateAgent } from '@/modules/agents/data'
import { parseAgentInput, parseId } from '@/modules/agents/rules'

export const dynamic = 'force-dynamic'

/** PATCH /api/account/agents/<id> { name, about }: renames one of the member's agents or changes its introduction. */
export async function PATCH(request: Request, { params }: RouteContext<'/api/account/agents/[id]'>) {
  const member = await memberOf(request)
  if ('response' in member) return member.response
  const id = parseId((await params).id)
  if (!id) return fail('not-found', 404)
  const input = parseAgentInput(await bodyOf(request))
  if (!input.ok) return fail(input.error, 400)
  const { payload } = await getDb()
  const result = await updateAgent(payload, member.session.user.id, id, input.value)
  if (result === 'not-found') return fail('not-found', 404)
  if (result === 'name-taken') return fail('name-taken', 409)
  return reply({ ok: true })
}

/** DELETE /api/account/agents/<id>: deletes one of the member's agents and its keys. */
export async function DELETE(request: Request, { params }: RouteContext<'/api/account/agents/[id]'>) {
  const member = await memberOf(request)
  if ('response' in member) return member.response
  const id = parseId((await params).id)
  if (!id) return fail('not-found', 404)
  const { payload } = await getDb()
  if (!(await deleteAgent(payload, member.session.user.id, id))) return fail('not-found', 404)
  return reply({ ok: true })
}
