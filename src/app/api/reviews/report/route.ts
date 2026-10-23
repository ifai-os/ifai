import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { shanghaiDate } from '@/lib/shanghai-day'
import { clientIp, visitorHash } from '@/lib/visitor'
import { reportReview } from '@/modules/apps/reviews/data'
import { parseReportInput, type ReviewsError } from '@/modules/apps/reviews/rules'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

const fail = (error: ReviewsError, status: number) => reply({ error }, status)

/**
 * POST /api/reviews/report { review, reason } → { reported: true }. Any reader can report a
 * review, from IFAI's own pages: a member once per review, a visitor once per review a day (by
 * the day's visitor hash, as app clicks count them). Nothing is hidden until the site owner looks.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseReportInput(await request.json().catch(() => null))
  if (!input) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  let reporter: string
  if (session) {
    reporter = `u:${session.user.id}`
  } else {
    const userAgent = request.headers.get('user-agent')?.trim()
    const secret = process.env.PAYLOAD_SECRET
    if (!userAgent || !secret) return fail('invalid-request', 400)
    reporter = `v:${visitorHash({ ip: clientIp(request.headers), userAgent, day: shanghaiDate(), secret })}`
  }
  const { payload } = await getDb()
  const result = await reportReview(payload, {
    reviewId: input.review,
    reason: input.reason,
    reporter,
    userId: session?.user.id ?? null,
  })
  if (result === 'not-found') return fail('not-found', 404)
  if (result === 'own-review') return fail('own-review', 400)
  return reply({ reported: true })
}
