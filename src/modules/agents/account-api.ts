import { NextResponse } from 'next/server'

import { auth, type Session } from '@/lib/auth/auth'
import { isCrossSite } from '@/lib/same-origin'

import type { AgentsError } from './rules'

/**
 * What the settings page's agent routes (src/app/api/account/agents) share: the member's own
 * agents and keys, from IFAI's own pages only, never cached or indexed.
 */

const noStore = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

export function fail(error: AgentsError, status: number) {
  return reply({ error }, status)
}

/** The signed-in member, or the answer for a request that is not theirs to make. */
export async function memberOf(request: Request): Promise<{ session: Session } | { response: NextResponse }> {
  if (isCrossSite(request)) return { response: fail('cross-site', 403) }
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return { response: fail('sign-in', 401) }
  return { session }
}

/** The JSON body, or null when there is none or it is not JSON. */
export async function bodyOf(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}
