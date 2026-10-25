import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { circlesLaunched } from '@/modules/circles/public'
import { setBlock } from '@/modules/profiles/blocks'
import { parseHandleSwitch, type BlockChange, type ProfilesError } from '@/modules/profiles/rules'

export const dynamic = 'force-dynamic'

const statusOf: Record<'not-found' | 'own-profile', number> = {
  'not-found': 404,
  'own-profile': 422,
}

/**
 * POST /api/account/blocks { handle, on } → BlockChange: the member blocks someone or unblocks
 * them (docs/specs/circles.md rule 23); an address they had before works too. Blocking ends the
 * follows both ways. Members only, from IFAI's own pages; with the circles, like members' pages.
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const input = parseHandleSwitch(await request.json().catch(() => null))
  if (!input) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const result = await setBlock(payload, { blockerId: session.user.id, ...input })
  if (result.status !== 'done') return reply({ error: result.status satisfies ProfilesError }, statusOf[result.status])
  return reply({ blocked: result.blocked } satisfies BlockChange)
}
