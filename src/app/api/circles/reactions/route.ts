import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { setReaction } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseReactionInput } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/reactions { post, reaction, on } → { reactions }: the member gives one of the
 * six reactions or takes it back; the answer is the post's reactions after it. Members only, from
 * IFAI's own pages, on a post readers can see.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseReactionInput(await request.json().catch(() => null))
  if (!input) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const reactions = await setReaction(
    payload,
    { postId: input.post, userId: session.user.id, reaction: input.reaction, on: input.on },
    await shownCircleIds(),
  )
  if (!reactions) return fail('not-found', 404)
  return reply({ reactions })
}
