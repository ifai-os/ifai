import { NextResponse, type NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { isCrossSite } from '@/lib/same-origin'
import { isSaveable, saveState, setSaved } from '@/modules/saves/data'
import { parseSaveTarget } from '@/modules/saves/target'

// Per member and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/** GET /api/saves?type=app&id=12 → { signedIn, saved, count }: what a page's save button shows. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const target = parseSaveTarget(params.get('type'), params.get('id'))
  if (!target) return reply({ error: 'invalid-target' }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  const state = await saveState(target, session?.user.id ?? null)
  return reply({ signedIn: Boolean(session), ...state })
}

/** POST /api/saves { type, id, saved } → { saved, count }. Members only, and only from IFAI's own pages. */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const body: unknown = await request.json().catch(() => null)
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const target = parseSaveTarget(input.type, input.id)
  if (!target || typeof input.saved !== 'boolean') return reply({ error: 'invalid-request' }, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return reply({ error: 'sign-in' }, 401)
  // Unsaving always works, so a member can clear a save of an app that is no longer listed.
  if (input.saved && !(await isSaveable(target))) return reply({ error: 'not-found' }, 404)
  return reply(await setSaved(target, session.user.id, input.saved))
}
