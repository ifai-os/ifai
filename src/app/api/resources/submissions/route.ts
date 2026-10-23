import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { parseSubmissionInput } from '@/modules/resources/submit/rules'
import { submitSkill } from '@/modules/resources/submit/submit'

// Per member and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * POST /api/resources/submissions { repository, note, email, locale } → { code, email }: a member
 * sends a Skill for review (docs/specs/resources.md, rule 12). Members only, from IFAI's own
 * pages; 400 names the fields that are not right; at most five a day (429).
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const parsed = parseSubmissionInput(await request.json().catch(() => null))
  if (!parsed.ok) return reply({ error: 'invalid', fields: parsed.fields }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return reply({ error: 'sign-in' }, 401)
  const { payload } = await getDb()
  const outcome = await submitSkill(payload, parsed.value, session.user.id)
  if (!outcome.ok) return reply({ error: outcome.error }, 429)
  return reply({ code: outcome.code, email: outcome.email })
}
