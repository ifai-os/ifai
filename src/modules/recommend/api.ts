import { NextResponse } from 'next/server'

import { recommendLaunched } from './rules'
import type { WriteError } from './writing'

/**
 * What the recommend routes (src/app/api/recommend) share: answers that are per reader and never
 * kept by the browser or a CDN.
 */

const noStore = { 'Cache-Control': 'private, no-store' }

export function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

export const fail = (error: WriteError, status: number) => reply({ error }, status)

/** Before 推荐 launches, its API is not there (docs/specs/recommend.md「页面与路由」). */
export function closed() {
  return recommendLaunched() ? null : fail('not-found', 404)
}

/** The HTTP status for each reason a save is turned down. */
export const saveStatus: Partial<Record<WriteError, number>> = {
  'not-found': 404,
  'daily-limit': 429,
  hidden: 409,
}
