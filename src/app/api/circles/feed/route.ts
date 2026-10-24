import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { circlesOverview, feedPage, joinedCircles } from '@/modules/circles/data'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseId, parseTab, type FeedPage } from '@/modules/circles/rules'

// Per reader and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

/**
 * GET /api/circles/feed?tab=hot|latest|mine[&circle=3][&cursor=…] → FeedPage: 20 posts and where
 * the next page starts. The first page (no cursor) also brings the circles' numbers and, for a
 * member, the circles they joined.
 */
export async function GET(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  const params = request.nextUrl.searchParams
  const tab = parseTab(params.get('tab'))
  const circle = params.has('circle') ? parseId(params.get('circle')) : null
  const cursor = params.has('cursor') ? parseId(params.get('cursor')) : null
  if (!tab || (params.has('circle') && !circle) || (params.has('cursor') && !cursor)) return fail('invalid-request', 400)
  const circleIds = await shownCircleIds()
  if (circle !== null && !circleIds.includes(circle)) return fail('not-found', 404)

  const session = await auth.api.getSession({ headers: request.headers })
  const userId = session?.user.id ?? null
  const { payload } = await getDb()
  const [page, overview, joined] = await Promise.all([
    feedPage(payload, { tab, circleIds, circle, cursor, userId }),
    cursor ? undefined : circlesOverview(payload, circleIds),
    cursor ? undefined : userId ? joinedCircles(payload, userId, circleIds) : Promise.resolve([]),
  ])
  const body: FeedPage = { signedIn: Boolean(session), ...page, ...(overview && { overview }), ...(joined && { joined }) }
  return reply(body)
}
