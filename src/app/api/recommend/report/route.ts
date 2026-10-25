import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { shanghaiDate } from '@/lib/shanghai-day'
import { clientIp, visitorHash } from '@/lib/visitor'
import { closed, fail, reply } from '@/modules/recommend/api'
import { reportArticle } from '@/modules/recommend/write'
import { parseReportInput } from '@/modules/recommend/writing'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recommend/report { article, reason } → { reported: true }. Any reader can report a
 * member's article, from IFAI's own pages (docs/specs/recommend.md rule 17): a member once per
 * article, a visitor once per article a day (by the day's visitor hash). Nothing is hidden until
 * the site owner looks.
 */
export async function POST(request: NextRequest) {
  const shut = closed()
  if (shut) return shut
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
  const result = await reportArticle(payload, { articleId: input.article, reason: input.reason, reporter, userId: session?.user.id ?? null })
  if (result === 'not-found') return fail('not-found', 404)
  if (result === 'own-article') return fail('own-article', 400)
  return reply({ reported: true })
}
