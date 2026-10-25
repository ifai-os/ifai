import { NextResponse } from 'next/server'
import type { Payload } from 'payload'

import { circlesOverview, joinedCircles } from './data'
import type { CirclesChange, CirclesError } from './rules'

/**
 * What the circles routes (src/app/api/circles) share: answers that are per reader and never
 * kept by the browser or a CDN, and the numbers a change sends back so the page can redraw the
 * cards, the header and「我的圈子」at once.
 */

const noStore = { 'Cache-Control': 'private, no-store' }

export function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

export const fail = (error: CirclesError, status: number) => reply({ error }, status)

/** Before the circles launch, their API is not there (docs/specs/circles.md「页面与路由」). */
export const notLaunched = () => fail('not-found', 404)

export async function changed(payload: Payload, circleIds: number[], userId: string): Promise<CirclesChange> {
  const [overview, joined] = await Promise.all([circlesOverview(payload, circleIds, userId), joinedCircles(payload, userId, circleIds)])
  return { overview, joined }
}
