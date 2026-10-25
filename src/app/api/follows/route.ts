import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { isCrossSite } from '@/lib/same-origin'
import { followStates, isFollowable, setFollowing } from '@/modules/follows/data'
import { maxReadTargets, parseFollowId, parseFollowTarget } from '@/modules/follows/rules'
import type { FollowTarget } from '@/modules/follows/target'

// Per member and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * GET /api/follows?t=tag-agents&t=topic-kimi → { signedIn, following, counts }: what a page's follow
 * buttons show, for every target on the page at once (docs/specs/daily.md「关注」).
 */
export async function GET(request: NextRequest) {
  const ids = [...new Set(request.nextUrl.searchParams.getAll('t'))]
  const targets = ids.map(parseFollowId)
  if (ids.length === 0 || ids.length > maxReadTargets || targets.some((target) => !target)) return reply({ error: 'invalid-target' }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  const states = await followStates(targets as FollowTarget[], session?.user.id ?? null)
  return reply({ signedIn: Boolean(session), ...states })
}

/** POST /api/follows { type, key, following } → { following, count }. Members only, and only from IFAI's own pages. */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const body: unknown = await request.json().catch(() => null)
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const target = parseFollowTarget(input.type, input.key)
  if (!target || typeof input.following !== 'boolean') return reply({ error: 'invalid-request' }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return reply({ error: 'sign-in' }, 401)
  // Unfollowing always works, so a member can clear a company no story is about any more.
  if (input.following && !(await isFollowable(target))) return reply({ error: 'not-found' }, 404)
  const result = await setFollowing(target, session.user.id, input.following)
  if (result === 'too-many') return reply({ error: 'too-many' }, 409)
  return reply(result)
}
