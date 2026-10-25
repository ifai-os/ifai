import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { detectLanguage } from '@/lib/i18n/detect'
import { isCrossSite } from '@/lib/same-origin'
import { changed, fail, notLaunched, reply } from '@/modules/circles/api'
import { createPost, deletePost, postView } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseId, parsePostInput, type CirclesChange } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/posts { circle, body, locale } → CirclesChange with the new post. Members
 * only, from IFAI's own pages, into a circle readers can see; at most ten posts a day (429).
 * Posting joins the circle.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const parsed = parsePostInput(await request.json().catch(() => null))
  if (!parsed.ok) return fail(parsed.error, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { circle, body, locale } = parsed.value
  const circleIds = await shownCircleIds()
  if (!circleIds.includes(circle)) return fail('not-found', 404)
  const userId = session.user.id
  const { payload } = await getDb()
  const result = await createPost(payload, { circleId: circle, userId, body, lang: detectLanguage(body, locale) })
  if (result.status === 'daily-limit') return fail('daily-limit', 429)
  const [change, post] = await Promise.all([changed(payload, circleIds, userId), postView(payload, result.postId, circleIds, userId)])
  const response: CirclesChange = { ...change, ...(post && { post }) }
  return reply(response)
}

/** DELETE /api/circles/posts?id=45 → CirclesChange: the member's own post is gone, with its reactions and reports. */
export async function DELETE(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const postId = parseId(request.nextUrl.searchParams.get('id'))
  if (!postId) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  if (!(await deletePost(payload, postId, session.user.id))) return fail('not-found', 404)
  return reply(await changed(payload, await shownCircleIds(), session.user.id))
}
