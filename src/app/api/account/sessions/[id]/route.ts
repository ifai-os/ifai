import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { otherSessionToken } from '@/lib/auth/settings'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'

// One member's own sign-ins: never rendered ahead or cached.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * DELETE /api/account/sessions/<id>: signs out one of the member's other devices (「登录的设备」,
 * docs/specs/account.md). Members only, from IFAI's own pages, and never the sign-in asking: that
 * one signs out from the menu. The page knows sessions by id; their tokens stay on the server.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext<'/api/account/sessions/[id]'>) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return reply({ error: 'sign-in' }, 401)
  const { id } = await params
  const { payload } = await getDb()
  const token = await otherSessionToken(payload, session.user.id, id, session.session.id)
  if (!token) return reply({ error: 'not-found' }, 404)
  await auth.api.revokeSession({ headers: request.headers, body: { token } })
  return reply({ ok: true }, 200)
}
