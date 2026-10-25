import { headers } from 'next/headers'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { getAppsByIds, getPublishedAppIds, type AppListItem } from '@/modules/apps/data'
import { memberReviewCounts, memberReviews } from '@/modules/apps/reviews/data'
import type { MemberReview } from '@/modules/apps/reviews/rules'
import { authorStats, feedPage } from '@/modules/circles/data'
import { withLinkCards } from '@/modules/circles/link-cards'
import { getCircles, getOverview } from '@/modules/circles/public'
import type { CircleView, PostView } from '@/modules/circles/rules'

import { blockState } from './blocks'
import { findByHandle, followCounts, followedAmong, peoplePage, profileView } from './data'
import {
  daysSince,
  isHandle,
  normalizeHandle,
  profileRules,
  type BlockState,
  type PeopleSide,
  type PersonRow,
  type ProfileTab,
  type ProfileView,
} from './rules'

/**
 * What members' pages show (docs/specs/circles.md「/u/[handle]」): read once per request, for the
 * metadata and the page, as the reader sees them. Their pages come with the circles
 * (src/app/(frontend)/[locale]/u/[handle] checks circlesLaunched).
 */

export type HandleLookup = { status: 'found'; userId: string; handle: string } | { status: 'moved'; handle: string } | { status: 'missing' }

/**
 * Whose page the address in the path is (rule 18): theirs now, one they had before or written in
 * capitals (`moved`: the page sends readers on to the address they have now), or nobody's.
 */
export const resolveHandle = cache(async (raw: string): Promise<HandleLookup> => {
  const handle = normalizeHandle(raw)
  if (!isHandle(handle)) return { status: 'missing' }
  const { payload } = await getDb()
  const found = await findByHandle(payload, handle)
  if (!found) return { status: 'missing' }
  if (found.moved || found.handle !== raw) return { status: 'moved', handle: found.handle }
  return { status: 'found', userId: found.userId, handle: found.handle }
})

/** A review on the page with the app it is about. */
export type ProfileReview = Omit<MemberReview, 'app'> & { app: Pick<AppListItem, 'slug' | 'name' | 'logo'> }

/** A circle they posted in, with its numbers on the circles page. */
export type ProfileCircle = { circle: CircleView; posts: number; members: number; today: number }

export type ProfilePageData = {
  profile: ProfileView
  /** It is the reader's own page. */
  own: boolean
  /** The reader follows them. */
  following: boolean
  /** The reader blocked them, or they blocked the reader (rule 23): the page is only its top half. */
  block: BlockState
  follows: { following: number; followers: number }
  /** The cards: only what everyone can see counts. */
  stats: { posts: number; reactions: number; comments: number; reviews: number; days: number }
  /** The circles they posted in (rule 22), most posts first. */
  circles: ProfileCircle[]
  /** The tabs' numbers: on their own page, their hidden posts and reviews count too. */
  counts: Record<ProfileTab, number>
  tab: ProfileTab
  /** The open tab's first page: 动态 reads on in the browser, 评价 pages with ?before=. None when blocked. */
  posts: { posts: PostView[]; next: number | null } | null
  reviews: { reviews: ProfileReview[]; next: number | null } | null
  /** When it was read, for「3 小时前」. */
  loadedAt: number
}

/**
 * A member's page for the reader: null when the member is gone. `before` pages the reviews.
 * Arguments are plain values so the metadata and the page share one read (React's cache).
 */
export const getProfilePage = cache(
  async (userId: string, locale: Locale, tab: ProfileTab, before: number | null): Promise<ProfilePageData | null> => {
    const [session, circles, { payload }, appIds] = await Promise.all([
      auth.api.getSession({ headers: await headers() }),
      getCircles(locale),
      getDb(),
      getPublishedAppIds(),
    ])
    const readerId = session?.user.id ?? null
    const own = readerId === userId
    const circleIds = circles.map((circle) => circle.id)
    const [profile, follows, followed, block, stats, reviewCounts, overview] = await Promise.all([
      profileView(payload, userId),
      followCounts(payload, userId),
      own ? new Set<string>() : followedAmong(payload, readerId, [userId]),
      blockState(payload, readerId, userId),
      authorStats(payload, userId, circleIds),
      memberReviewCounts(payload, userId, appIds),
      getOverview(circleIds),
    ])
    if (!profile) return null

    const circleOf = new Map(circles.map((circle) => [circle.id, circle]))
    const numbersOf = new Map(overview.circles.map((item) => [item.id, item]))
    const postedIn = stats.circles.flatMap(({ id, posts }) => {
      const circle = circleOf.get(id)
      return circle ? [{ circle, posts, members: numbersOf.get(id)?.members ?? 0, today: numbersOf.get(id)?.today ?? 0 }] : []
    })

    const [posts, reviews] = await Promise.all([
      tab === 'posts' && !block
        ? feedPage(payload, { tab: 'latest', circleIds, circle: null, cursor: null, userId: readerId, authorId: userId }).then(async (page) => ({
            posts: await withLinkCards(page.posts, locale),
            next: page.next,
          }))
        : null,
      tab === 'reviews' && !block ? profileReviews(userId, { appIds, own, before, locale }) : null,
    ])

    return {
      profile,
      own,
      following: followed.has(userId),
      block,
      follows,
      stats: {
        posts: stats.posts,
        reactions: stats.reactions,
        comments: stats.comments,
        reviews: reviewCounts.shown,
        days: daysSince(new Date(profile.joinedAt)),
      },
      circles: postedIn,
      counts: {
        posts: stats.posts + (own ? stats.hidden : 0),
        reviews: own ? reviewCounts.all : reviewCounts.shown,
        circles: postedIn.length,
      },
      tab,
      posts,
      reviews,
      loadedAt: Date.now(),
    }
  },
)

async function profileReviews(
  userId: string,
  { appIds, own, before, locale }: { appIds: number[]; own: boolean; before: number | null; locale: Locale },
): Promise<{ reviews: ProfileReview[]; next: number | null }> {
  const { payload } = await getDb()
  const page = await memberReviews(payload, { userId, appIds, own, before, size: profileRules.reviewsPageSize })
  const apps = new Map(
    (
      await getAppsByIds(
        page.reviews.map((review) => review.app),
        locale,
      )
    ).map((app) => [app.id, app]),
  )
  return {
    reviews: page.reviews.flatMap(({ app: appId, ...review }) => {
      const app = apps.get(appId)
      return app ? [{ ...review, app: { slug: app.slug, name: app.name, logo: app.logo } }] : []
    }),
    next: page.next,
  }
}

export type PeoplePageData = {
  profile: ProfileView
  follows: { following: number; followers: number }
  people: PersonRow[]
  /** Pass as `before` for the next page; null when this was the last. */
  next: number | null
}

/** One page of the people who follow a member or whom they follow, for the reader; null when the member is gone. */
export const getPeoplePage = cache(async (userId: string, side: PeopleSide, before: number | null): Promise<PeoplePageData | null> => {
  const [session, { payload }] = await Promise.all([auth.api.getSession({ headers: await headers() }), getDb()])
  const [profile, follows, page] = await Promise.all([
    profileView(payload, userId),
    followCounts(payload, userId),
    peoplePage(payload, { userId, side, readerId: session?.user.id ?? null, before }),
  ])
  return profile ? { profile, follows, ...page } : null
})
