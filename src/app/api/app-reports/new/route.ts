import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { shanghaiDate } from '@/lib/shanghai-day'
import { clientIp, visitorHash } from '@/lib/visitor'
import { submitReport } from '@/modules/apps/reports/data'
import { parseAppReportInput, type AppReportsError } from '@/modules/apps/reports/rules'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

const fail = (error: AppReportsError, status: number) => reply({ error }, status)

/**
 * POST /api/app-reports/new { app, kind, body, contact, locale } → { reported: true }:「信息有误？」
 * on an app's page. Any reader can report, from IFAI's own pages: a member by account, a visitor
 * by the day's visitor hash, each up to 10 times a Shanghai day. Not /api/app-reports itself:
 * that is Payload's REST address for the collection, which the back office uses.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseAppReportInput(await request.json().catch(() => null))
  if (!input.ok) return fail(input.error, 400)
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
  const result = await submitReport(payload, { ...input.value, reporter })
  if (result === 'not-found') return fail('not-found', 404)
  if (result === 'daily-limit') return fail('daily-limit', 429)
  return reply({ reported: true })
}
