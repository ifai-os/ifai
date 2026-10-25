import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { circlesLaunched } from '@/modules/circles/public'
import { setFollow } from '@/modules/profiles/data'
import { parseFollowInput, type FollowChange, type ProfilesError } from '@/modules/profiles/rules'

export const dynamic = 'force-dynamic'

const statusOf: Record<'not-found' | 'own-profile' | 'daily-limit' | 'too-many', number> = {
  'not-found': 404,
  'own-profile': 422,
  'daily-limit': 429,
  'too-many': 429,
}

/**
 * POST /api/follows/members { handle, on } → FollowChange: the member follows someone or stops
 * (docs/specs/circles.md rule 20); an address they had before works too. Members only, from
 * IFAI's own pages; with the circles, like the pages that have the button.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseFollowInput(await request.json().catch(() => null))
  if (!input) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const result = await setFollow(payload, { followerId: session.user.id, ...input })
  if (result.status !== 'done') return reply({ error: result.status satisfies ProfilesError }, statusOf[result.status])
  return reply(result.change satisfies FollowChange)
}
