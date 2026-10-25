import { headers } from 'next/headers'
import { cache } from 'react'

import { isLaunched } from '@/config/site'
import type { Locale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { cached } from '@/lib/data-cache'
import { getDb } from '@/lib/db/drizzle'
import { hasBlocks } from '@/modules/profiles/blocks'

import { circlesCacheTag } from './cache'
import { commentsPage } from './comments'
import { circlesOverview, postView } from './data'
import { withLinkCards } from './link-cards'
import { suggestionCandidates, type SuggestionCandidate } from './people'
import { parseId, type CircleView, type CirclesOverview, type CommentsPage, type PostView } from './rules'

/** Circles launch in phase two: until then their page and API answer 404 (docs/specs/circles.md「页面与路由」). */
export function circlesLaunched(): boolean {
  return isLaunched('circles')
}

// Back-office saves refresh this right away; the hour only bounds changes made outside Payload's hooks.
const loadCircles = cached(
  async (locale: Locale): Promise<CircleView[]> => {
    const { payload } = await getDb()
    const { docs } = await payload.find({
      collection: 'circles',
      where: { shown: { equals: true } },
      sort: ['order', 'id'],
      locale,
      depth: 0,
      limit: 100,
      pagination: false,
      overrideAccess: false,
      select: { slug: true, name: true, description: true, tone: true },
    })
    return docs.map((doc) => ({
      id: doc.id,
      slug: doc.slug,
      name: doc.name,
      description: doc.description ?? null,
      tone: Number(doc.tone) || 0,
    }))
  },
  ['circles-shown'],
  { tags: [circlesCacheTag], revalidate: 3600 },
)

/** The circles readers can see, in the site owner's order, named in `locale` (English where a name is missing). */
export const getCircles = cache((locale: Locale) => loadCircles(locale))

/** The ids of the circles readers can see: only these take posts, and only their posts show. */
export async function shownCircleIds(): Promise<number[]> {
  return (await getCircles('en')).map((circle) => circle.id)
}

/**
 * The numbers in the page's first paint: a few minutes old at most. The page's own requests bring
 * fresh ones (GET /api/circles/feed) right after.
 */
const loadOverview = cached(
  async (ids: number[]): Promise<CirclesOverview> => {
    const { payload } = await getDb()
    return circlesOverview(payload, ids)
  },
  ['circles-overview'],
  { revalidate: 300 },
)

/** Everyone shares the cached numbers, except a member in a block, whose cards leave the other one out (rule 23). */
export async function getOverview(ids: number[]): Promise<CirclesOverview> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) {
    const { payload } = await getDb()
    if (await hasBlocks(payload, session.user.id)) return circlesOverview(payload, ids, session.user.id)
  }
  return loadOverview(ids)
}

/** 「值得关注的人」before each reader's follows are taken out: worked out every ten minutes (docs/specs/circles.md rule 21). */
const loadCandidates = cached(
  async (ids: number[]): Promise<SuggestionCandidate[]> => {
    const { payload } = await getDb()
    return suggestionCandidates(payload, ids)
  },
  ['circles-people'],
  { revalidate: 600 },
)

export async function getSuggestionCandidates(ids: number[]): Promise<SuggestionCandidate[]> {
  return loadCandidates(ids)
}

export type PostPageData = {
  post: PostView
  /** The circle it is in, for the links above it and the title. */
  circle: CircleView
  /**
   * The first page of comments. Null on a hidden post, which only its author opens and which has
   * none to show, or when they could not be read: the page then reads them itself.
   */
  comments: CommentsPage | null
  /** When it was read, for「3 小时前」. */
  loadedAt: number
}

/**
 * A post's page for the reader (docs/specs/circles.md「/circles/p/[id]」): null when it is not
 * there for them: deleted, in a hidden circle, or hidden and not theirs. Read once per request,
 * for the metadata and the page.
 */
export const getPostPage = cache(async (id: string, locale: Locale): Promise<PostPageData | null> => {
  const postId = parseId(id)
  if (!postId) return null
  const [session, circles, { payload }] = await Promise.all([auth.api.getSession({ headers: await headers() }), getCircles(locale), getDb()])
  const userId = session?.user.id ?? null
  const circleIds = circles.map((circle) => circle.id)
  const view = await postView(payload, postId, circleIds, userId)
  const circle = view && circles.find((item) => item.id === view.circle)
  if (!view || !circle) return null
  const [post, comments] = await Promise.all([
    withLinkCards([view], locale).then(([item]) => item),
    view.hidden
      ? null
      : commentsPage(payload, { postId, circleIds, userId, cursor: null }).catch((error: unknown) => {
          console.warn('Could not read the comments of circle post', postId, error)
          return null
        }),
  ])
  return { post, circle, comments: comments && { signedIn: Boolean(session), ...comments }, loadedAt: Date.now() }
})
