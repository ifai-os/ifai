import { cache } from 'react'

import { isLaunched } from '@/config/site'
import type { Locale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { getDb } from '@/lib/db/drizzle'

import { circlesCacheTag } from './cache'
import { circlesOverview } from './data'
import type { CircleView, CirclesOverview } from './rules'

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

export async function getOverview(ids: number[]): Promise<CirclesOverview> {
  return loadOverview(ids)
}
