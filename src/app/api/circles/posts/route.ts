import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { detectLanguage } from '@/lib/i18n/detect'
import { isCrossSite } from '@/lib/same-origin'
import { changed, fail, notLaunched, reply } from '@/modules/circles/api'
import { createPost, deletePost, postView } from '@/modules/circles/data'
import { withLinkCards } from '@/modules/circles/link-cards'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseId, parsePostInput, type CirclesChange } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/posts { circle, body, locale, images?, video? } → CirclesChange with the new
 * post. Members only, from IFAI's own pages, into a circle readers can see; at most ten posts a
 * day (429). Pictures are ids from POST /api/circles/images that the member has not posted yet,
 * the video an id from POST /api/circles/videos (422 otherwise). Posting joins the circle.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const parsed = parsePostInput(await request.json().catch(() => null))
  if (!parsed.ok) return fail(parsed.error, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { circle, body, locale, images, video } = parsed.value
  const circleIds = await shownCircleIds()
  if (!circleIds.includes(circle)) return fail('not-found', 404)
  const userId = session.user.id
  const { payload } = await getDb()
  // A post with only pictures or a video is in no language of its own.
  const lang = body ? detectLanguage(body, locale) : 'und'
  const result = await createPost(payload, { circleId: circle, userId, body, lang, images, videoId: video })
  if (result.status === 'daily-limit') return fail('daily-limit', 429)
  if (result.status !== 'created') return fail(result.status, 422)
  const [change, created] = await Promise.all([changed(payload, circleIds, userId), postView(payload, result.postId, circleIds, userId)])
  const [post] = created ? await withLinkCards([created], locale) : []
  const response: CirclesChange = { ...change, ...(post && { post }) }
  return reply(response)
}

/** DELETE /api/circles/posts?id=45 → CirclesChange: the member's own post is gone, with its reactions, reports and pictures. */
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
