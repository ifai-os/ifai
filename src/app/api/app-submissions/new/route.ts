import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { submitApp } from '@/modules/apps/submissions/data'
import { parseAppSubmissionInput, type AppSubmissionsError } from '@/modules/apps/submissions/rules'

// Per member and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

const fail = (error: AppSubmissionsError, status: number, more: object = {}) => reply({ error, ...more }, status)

/**
 * POST /api/app-submissions/new { website, name, category, note, email, locale } → { code, email,
 * submittedAt, name, category }:「提交应用」(docs/specs/apps.md 5e). Members only, from IFAI's own
 * pages; 400 names the fields that are not right, 409 points at the app when it is already
 * listed, at most five a day (429). Not /api/app-submissions itself: that is Payload's REST
 * address for the collection, which the back office uses.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return fail('cross-site', 403)
  const parsed = parseAppSubmissionInput(await request.json().catch(() => null))
  if (!parsed.ok) return fail('invalid', 400, { fields: parsed.fields })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const outcome = await submitApp(payload, parsed.value, session.user.id)
  if (!outcome.ok) return outcome.error === 'listed' ? fail('listed', 409, { app: outcome.app }) : fail('daily-limit', 429)
  const { code, email, submittedAt, name, category } = outcome
  return reply({ code, email, submittedAt, name, category })
}
