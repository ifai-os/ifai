import type { NextRequest } from 'next/server'
import type { Payload } from 'payload'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { shanghaiDate } from '@/lib/shanghai-day'
import { clientIp, visitorHash } from '@/lib/visitor'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { reportComment } from '@/modules/circles/comments'
import { reportPost } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseReportInput, type ReportReason, type ReportTarget } from '@/modules/circles/rules'
import { reportMember } from '@/modules/profiles/reports'

export const dynamic = 'force-dynamic'

/**
 * POST /api/circles/report { post, reason }, { comment, reason } or { member, reason } →
 * { reported: true }. Any reader can report a post, a comment or a member at their address
 * (docs/specs/circles.md rule 24), from IFAI's own pages: a member once each, a visitor once each
 * a day (by the day's visitor hash, as review reports count them). Nobody can report their own,
 * or themselves. Nothing changes until the site owner looks.
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
  const userId = session?.user.id ?? null
  const result =
    'member' in input
      ? await reportMember(payload, { handle: input.member, reason: input.reason, reporter, userId })
      : await reportContent(payload, input.target, input.reason, reporter, userId)
  if (result === 'not-found') return fail('not-found', 404)
  if (result !== 'reported') return fail(result, 400)
  return reply({ reported: true })
}

async function reportContent(payload: Payload, target: ReportTarget, reason: ReportReason, reporter: string, userId: string | null) {
  const circleIds = await shownCircleIds()
  return target.kind === 'post'
    ? reportPost(payload, { postId: target.id, reason, reporter, userId }, circleIds)
    : reportComment(payload, { commentId: target.id, reason, reporter, userId }, circleIds)
}
