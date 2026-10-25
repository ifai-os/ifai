import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { isCrossSite } from '@/lib/same-origin'
import { openBattle } from '@/modules/rankings/battles'
import { parseOpenInput, rankingsLaunched } from '@/modules/rankings/rules'

// Per reader and always new: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * POST /api/rankings/battles { arena?, locale } → { signedIn, battle }: a question of the arena
 * with two anonymous answers (docs/specs/rankings.md「页面与路由」). Members get an id to vote
 * with; visitors see the same without one. `{ empty: true }` when the arena has no usable
 * question yet. Only from IFAI's own pages; members get at most 600 questions a day.
 */
export async function POST(request: NextRequest) {
  if (!rankingsLaunched()) return reply({ error: 'not-found' }, 404)
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const input = parseOpenInput(await request.json().catch(() => null))
  if (!input) return reply({ error: 'invalid-request' }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  const result = await openBattle({ ...input, userId: session?.user.id ?? null })
  const signedIn = Boolean(session)
  if (result.status === 'not-found') return reply({ error: 'not-found' }, 404)
  if (result.status === 'daily-limit') return reply({ error: 'daily-limit' }, 429)
  if (result.status === 'empty') return reply({ signedIn, empty: true })
  return reply({ signedIn, battle: result.battle })
}
