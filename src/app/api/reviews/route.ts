import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { detectLanguage } from '@/lib/i18n/detect'
import { isCrossSite } from '@/lib/same-origin'
import { deleteReview, isReviewable, reviewsPage, saveReview } from '@/modules/apps/reviews/data'
import { parseId, parseReviewInput, type ReviewsError } from '@/modules/apps/reviews/rules'

// Per member and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

const fail = (error: ReviewsError, status: number) => reply({ error }, status)

/** GET /api/reviews?app=12[&before=345] → ReviewsPage: the summary, the reader's own review and the others, newest first. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const appId = parseId(params.get('app'))
  const before = params.has('before') ? parseId(params.get('before')) : null
  if (!appId || (params.has('before') && !before)) return fail('invalid-request', 400)
  const { payload } = await getDb()
  if (!(await isReviewable(payload, appId))) return fail('not-found', 404)
  const session = await auth.api.getSession({ headers: request.headers })
  const page = await reviewsPage(payload, appId, session?.user.id ?? null, before)
  return reply({ signedIn: Boolean(session), ...page })
}

/**
 * POST /api/reviews { app, rating, body, locale } → the first page again, with the member's review.
 * Writes their review of the app or changes it. Members only, from IFAI's own pages; at most
 * five new reviews a day (429).
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return fail('cross-site', 403)
  const parsed = parseReviewInput(await request.json().catch(() => null))
  if (!parsed.ok) return fail(parsed.error, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { app, rating, body, locale } = parsed.value
  const { payload } = await getDb()
  if (!(await isReviewable(payload, app))) return fail('not-found', 404)
  const userId = session.user.id
  const result = await saveReview(payload, { appId: app, userId, rating, body, lang: detectLanguage(body, locale) })
  if (result === 'daily-limit') return fail('daily-limit', 429)
  return reply({ signedIn: true, ...(await reviewsPage(payload, app, userId, null)) })
}

/** DELETE /api/reviews?app=12 → the first page again: the member's review of the app is gone. */
export async function DELETE(request: NextRequest) {
  if (isCrossSite(request)) return fail('cross-site', 403)
  const appId = parseId(request.nextUrl.searchParams.get('app'))
  if (!appId) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  await deleteReview(payload, appId, session.user.id)
  return reply({ signedIn: true, ...(await reviewsPage(payload, appId, session.user.id, null)) })
}
