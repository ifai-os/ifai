import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { shanghaiDate } from '@/lib/shanghai-day'
import { clientIp, visitorHash } from '@/lib/visitor'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { reportPost } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseReportInput } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/report { post, reason } → { reported: true }. Any reader can report a post,
 * from IFAI's own pages: a member once per post, a visitor once per post a day (by the day's
 * visitor hash, as review reports count them). Nothing is hidden until the site owner looks.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
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
  const result = await reportPost(
    payload,
    { postId: input.post, reason: input.reason, reporter, userId: session?.user.id ?? null },
    await shownCircleIds(),
  )
  if (result === 'not-found') return fail('not-found', 404)
  if (result === 'own-post') return fail('own-post', 400)
  return reply({ reported: true })
}
