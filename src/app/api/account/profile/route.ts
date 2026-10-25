import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { circlesLaunched } from '@/modules/circles/public'
import { saveProfile } from '@/modules/profiles/data'
import { parseProfileInput, type ProfilesError } from '@/modules/profiles/rules'

// One member's own profile: never rendered ahead or cached.
export const dynamic = 'force-dynamic'

const statusOf: Record<Exclude<ProfilesError, 'cross-site' | 'sign-in'>, number> = {
  'invalid-handle': 422,
  'reserved-handle': 422,
  'bio-too-long': 422,
  'invalid-website': 422,
  'invalid-locale': 422,
  'invalid-request': 400,
  'handle-taken': 409,
  'handle-too-soon': 429,
  'not-found': 404,
  'own-profile': 422,
  'daily-limit': 429,
  'too-many': 429,
  blocked: 403,
}

/**
 * PATCH /api/account/profile { handle?, bio?, website?, locale } → { profile }: the address, the
 * line about oneself and one's site from「设置」(docs/specs/circles.md rules 18 and 19); only the
 * fields sent change. Members only, from IFAI's own pages; there with the circles, whose pages
 * show them.
 */
export async function PATCH(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseProfileInput(await request.json().catch(() => null))
  if (!input.ok) return reply({ error: input.error }, statusOf[input.error])
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const result = await saveProfile(payload, session.user.id, input.value)
  switch (result.status) {
    case 'saved':
      return reply({ profile: result.profile })
    case 'handle-too-soon':
      return reply({ error: result.status, nextChange: result.nextChange }, statusOf[result.status])
    default:
      return reply({ error: result.status }, statusOf[result.status])
  }
}
