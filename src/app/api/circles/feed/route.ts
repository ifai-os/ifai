import type { NextRequest } from 'next/server'

import { defaultLocale, isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { circlesOverview, feedPage, joinedCircles } from '@/modules/circles/data'
import { withLinkCards } from '@/modules/circles/link-cards'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseId, parseTab, type FeedPage } from '@/modules/circles/rules'
import { findByHandle, followCounts } from '@/modules/profiles/data'
import { isHandle, normalizeHandle } from '@/modules/profiles/rules'

// Per reader and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

/**
 * GET /api/circles/feed?tab=hot|latest|following|mine[&circle=3][&cursor=…][&locale=ja] → FeedPage:
 * 20 posts and where the next page starts. The first page (no cursor) also brings the circles'
 * numbers and, for a member, the circles they joined, and on 关注 how many people they follow.
 * `?author=linqi` instead reads one member's posts for their page, newest first, without the
 * circles' numbers. `locale` names the apps and Skills on the posts' link cards (English when left out).
 */
export async function GET(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  const params = request.nextUrl.searchParams
  const tab = parseTab(params.get('tab'))
  const circle = params.has('circle') ? parseId(params.get('circle')) : null
  const cursor = params.has('cursor') ? parseId(params.get('cursor')) : null
  const handle = params.has('author') ? normalizeHandle(params.get('author') ?? '') : null
  const locale = params.get('locale') ?? defaultLocale
  if (!tab || (params.has('circle') && !circle) || (params.has('cursor') && !cursor) || (handle !== null && !isHandle(handle)) || !isLocale(locale))
    return fail('invalid-request', 400)
  const circleIds = await shownCircleIds()
  if (circle !== null && !circleIds.includes(circle)) return fail('not-found', 404)

  const session = await auth.api.getSession({ headers: request.headers })
  const userId = session?.user.id ?? null
  const { payload } = await getDb()
  const author = handle === null ? null : await findByHandle(payload, handle)
  if (handle !== null && !author) return fail('not-found', 404)
  if (author) {
    const page = await feedPage(payload, { tab: 'latest', circleIds, circle, cursor, userId, authorId: author.userId })
    const body: FeedPage = { signedIn: Boolean(session), posts: await withLinkCards(page.posts, locale), next: page.next }
    return reply(body)
  }

  const first = cursor === null
  const [page, overview, joined, follows] = await Promise.all([
    feedPage(payload, { tab, circleIds, circle, cursor, userId }),
    first ? circlesOverview(payload, circleIds) : undefined,
    first ? (userId ? joinedCircles(payload, userId, circleIds) : Promise.resolve([])) : undefined,
    first && tab === 'following' && userId ? followCounts(payload, userId).then((counts) => counts.following) : undefined,
  ])
  const posts = await withLinkCards(page.posts, locale)
  const body: FeedPage = {
    signedIn: Boolean(session),
    posts,
    next: page.next,
    ...(overview && { overview }),
    ...(joined && { joined }),
    ...(follows !== undefined && { follows }),
  }
  return reply(body)
}
