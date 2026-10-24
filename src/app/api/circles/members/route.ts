import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { changed, fail, notLaunched, reply } from '@/modules/circles/api'
import { setMembership } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseMembershipInput } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/** POST /api/circles/members { circle, joined } → CirclesChange: the member joins the circle, or leaves it. Members only, from IFAI's own pages. */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseMembershipInput(await request.json().catch(() => null))
  if (!input) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const circleIds = await shownCircleIds()
  if (!circleIds.includes(input.circle)) return fail('not-found', 404)
  const { payload } = await getDb()
  await setMembership(payload, input.circle, session.user.id, input.joined)
  return reply(await changed(payload, circleIds, session.user.id))
}
