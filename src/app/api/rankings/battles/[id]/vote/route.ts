import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { isCrossSite } from '@/lib/same-origin'
import { castVote } from '@/modules/rankings/battles'
import { isBattleId, parseVoteInput, rankingsLaunched } from '@/modules/rankings/rules'

// Per member: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

const statusOf = { 'not-found': 404, 'voted-already': 409, expired: 410, 'daily-limit': 429 } as const

/**
 * POST /api/rankings/battles/<id>/vote { outcome, locale } → { counted, models: { a, b } }: the
 * member's vote on a question they were shown, and who wrote which answer. Members only (401),
 * from IFAI's own pages (403); once per question (409), within two hours (410), at most 200 a day (429).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!rankingsLaunched()) return reply({ error: 'not-found' }, 404)
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const { id } = await params
  const input = parseVoteInput(await request.json().catch(() => null))
  if (!input) return reply({ error: 'invalid-request' }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return reply({ error: 'sign-in' }, 401)
  if (!isBattleId(id)) return reply({ error: 'not-found' }, 404)
  const result = await castVote({ id, userId: session.user.id, ...input })
  if (result.status !== 'voted') return reply({ error: result.status }, statusOf[result.status])
  return reply({ counted: result.counted, models: result.models })
}
