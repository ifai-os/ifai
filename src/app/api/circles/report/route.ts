import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { shanghaiDate } from '@/lib/shanghai-day'
import { clientIp, visitorHash } from '@/lib/visitor'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { reportComment } from '@/modules/circles/comments'
import { reportPost } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseReportInput } from '@/modules/circles/rules'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/report { post, reason } or { comment, reason } → { reported: true }. Any
 * reader can report a post or a comment, from IFAI's own pages: a member once each, a visitor
 * once each a day (by the day's visitor hash, as review reports count them). Nobody can report
 * their own. Nothing is hidden until the site owner looks.
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
  const { target, reason } = input
  const userId = session?.user.id ?? null
  const circleIds = await shownCircleIds()
  const result =
    target.kind === 'post'
      ? await reportPost(payload, { postId: target.id, reason, reporter, userId }, circleIds)
      : await reportComment(payload, { commentId: target.id, reason, reporter, userId }, circleIds)
  if (result === 'not-found') return fail('not-found', 404)
  if (result !== 'reported') return fail(result, 400)
  return reply({ reported: true })
}
