import config from '@payload-config'
import { and, desc, eq, gte, inArray, isNull, lte, max } from '@payloadcms/db-postgres/drizzle'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { getDb } from '@/lib/db/drizzle'
import type { Localized } from '@/lib/i18n/localized'
import { DAILY_CACHE_TAG } from '@/modules/daily/review/cache'

import { appsCacheTag } from './cache'
import type { ListHeat } from './boards'
import { addDays } from './metrics/days'
import { appMentions, appMetricsDaily } from './schema'

/**
 * What the public pages read of the heat tables: the latest day's figures for the lists, short
 * histories for the 7-day lines, one app's last 90 days and the stories that mention it. The
 * pages show the latest day the job wrote (its rows are replaced in one transaction, so a day
 * is always complete). Cached under `appsCacheTag`, which the job refreshes when it finishes.
 */

// The job refreshes the cache when it finishes; the hour only bounds changes made outside it.
const cacheOptions = { tags: [appsCacheTag], revalidate: 3600 }

/** Longest history an app's page draws. */
export const historyDays = 90

export type HeatPoint = { day: string; heat: number }

export type LatestHeat = {
  /** Shanghai date of the latest scored day; null before the first run. */
  day: string | null
  /** When that day's numbers were written. */
  updatedAt: string | null
  /** By app id. Kept small (a few numbers per app) so the cached entry stays well under 2 MB with thousands of apps. */
  apps: Record<number, ListHeat>
}

/** Every published app's heat on the latest scored day. */
export const loadLatestHeat = unstable_cache(
  async (): Promise<LatestHeat> => {
    const { db } = await getDb()
    const [latest] = await db.select({ day: max(appMetricsDaily.day) }).from(appMetricsDaily)
    if (!latest?.day) return { day: null, updatedAt: null, apps: {} }
    const rows = await db
      .select({
        appId: appMetricsDaily.appId,
        heat: appMetricsDaily.heat,
        change7d: appMetricsDaily.change7d,
        rankOverall: appMetricsDaily.rankOverall,
        rankRising: appMetricsDaily.rankRising,
        trancoRank: appMetricsDaily.trancoRank,
        createdAt: appMetricsDaily.createdAt,
      })
      .from(appMetricsDaily)
      .where(eq(appMetricsDaily.day, latest.day))
    const apps: Record<number, ListHeat> = {}
    let written = 0
    for (const { appId, createdAt, ...heat } of rows) {
      apps[appId] = heat
      written = Math.max(written, createdAt.getTime())
    }
    return { day: latest.day, updatedAt: written ? new Date(written).toISOString() : null, apps }
  },
  ['apps-heat-latest'],
  cacheOptions,
)

/** The apps' daily heat from `since` to `until` (inclusive), oldest first. */
export const loadHeatHistory = unstable_cache(
  async (appIds: number[], since: string, until: string): Promise<Record<number, HeatPoint[]>> => {
    if (appIds.length === 0) return {}
    const { db } = await getDb()
    const rows = await db
      .select({ appId: appMetricsDaily.appId, day: appMetricsDaily.day, heat: appMetricsDaily.heat })
      .from(appMetricsDaily)
      .where(
        and(inArray(appMetricsDaily.appId, appIds), gte(appMetricsDaily.day, since), lte(appMetricsDaily.day, until)),
      )
      .orderBy(appMetricsDaily.day)
    const history: Record<number, HeatPoint[]> = {}
    for (const { appId, day, heat } of rows) (history[appId] ??= []).push({ day, heat })
    return history
  },
  ['apps-heat-history'],
  cacheOptions,
)

/** An app's figures on one scored day: the three parts, what they came from, and its places. */
export type AppHeatFigures = {
  day: string
  heat: number
  change7d: number | null
  rankScore: number
  engagementScore: number
  mentionScore: number
  trancoRank: number | null
  clicks: number
  saves: number
  mentions: number
  rankOverall: number
  rankCategory: number | null
  rankRising: number | null
}

export type AppHeat = { latest: AppHeatFigures | null; history: HeatPoint[] }

/** One app on the latest scored day `day`, and its heat over the `historyDays` before it. */
export const loadAppHeat = unstable_cache(
  async (appId: number, day: string): Promise<AppHeat> => {
    const { db } = await getDb()
    const rows = await db
      .select()
      .from(appMetricsDaily)
      .where(
        and(
          eq(appMetricsDaily.appId, appId),
          gte(appMetricsDaily.day, addDays(day, -historyDays)),
          lte(appMetricsDaily.day, day),
        ),
      )
      .orderBy(appMetricsDaily.day)
    const last = rows[rows.length - 1]
    // An app with no row that day was not published when the job ran: no heat until the next run.
    const latest =
      last && last.day === day
        ? {
            day: last.day,
            heat: last.heat,
            change7d: last.change7d,
            rankScore: last.rankScore,
            engagementScore: last.engagementScore,
            mentionScore: last.mentionScore,
            trancoRank: last.trancoRank,
            clicks: last.clicks,
            saves: last.saves,
            mentions: last.mentions,
            rankOverall: last.rankOverall,
            rankCategory: last.rankCategory,
            rankRising: last.rankRising,
          }
        : null
    return { latest, history: rows.map((row) => ({ day: row.day, heat: row.heat })) }
  },
  ['apps-heat-app'],
  cacheOptions,
)

export type RawMention = {
  slug: string
  title: Localized<string>
  category: string
  publishedAt: string
}

/**
 * The newest published stories matched to the app (the job's matches, less the ones the site
 * owner removed). Read with the visitor's access rules, so a story taken down since the last
 * run drops out at once; cached under the daily tag too for that reason.
 */
export const loadAppMentions = unstable_cache(
  async (appId: number, limit: number): Promise<RawMention[]> => {
    const { db } = await getDb()
    const rows = await db
      .select({ storyId: appMentions.storyId })
      .from(appMentions)
      .where(and(eq(appMentions.appId, appId), isNull(appMentions.removedAt)))
      .orderBy(desc(appMentions.publishedAt))
      // A few spare in case some were taken down.
      .limit(limit * 2)
    if (rows.length === 0) return []
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'stories',
      where: { and: [{ status: { equals: 'published' } }, { id: { in: rows.map((row) => row.storyId) } }] },
      pagination: false,
      locale: 'all',
      depth: 0,
      select: { slug: true, title: true, category: true, publishedAt: true, createdAt: true },
      overrideAccess: false,
    })
    const stories = new Map(docs.map((doc) => [doc.id, doc]))
    return rows
      .map((row) => stories.get(row.storyId))
      .filter((story) => story !== undefined)
      .slice(0, limit)
      .map((story) => ({
        slug: story.slug,
        title: story.title as unknown as Localized<string>,
        category: story.category,
        publishedAt: story.publishedAt ?? story.createdAt,
      }))
  },
  ['apps-mentions'],
  { tags: [appsCacheTag, DAILY_CACHE_TAG], revalidate: 3600 },
)
