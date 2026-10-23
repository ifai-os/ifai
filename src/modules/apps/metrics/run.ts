import { and, count, desc, eq, gte, inArray, lt, lte } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import { errorMessage } from '@/modules/daily/collect/fetch'
import { newSaveCounts } from '@/modules/saves/data'

import { refreshAppsCache } from '../cache'
import { changeDays, engagementDays, mentionDays, scoreApps, type HeatInput } from '../heat'
import { appClicks, appHeatRuns, appMetricsDaily, type TrancoStatus } from '../schema'
import { addDays, shanghaiMidnight } from './days'
import { trancoCandidates, trancoRankOf } from './domains'
import { mentionCounts, syncMentions } from './mentions'
import { loadPublishedApps } from './published'
import { fetchTrancoRanks } from './tranco'

/**
 * The daily heat run (docs/specs/apps.md「定时任务与 AI」), one function per job step:
 * start → Tranco → mentions → heat → finish. `day` is the Shanghai date of the run; the
 * counts cover the days before it, so a run at 06:00 never sees half a day.
 */

export type TrancoOutcome =
  | { status: 'fresh'; listId: string; ranks: Record<string, number> }
  | { status: 'failed'; error: string }

/** Open (or reopen, when it is run again the same day) the record the back office reads. */
export async function startRun(day: string): Promise<void> {
  const { db } = await getDb()
  const started = { status: 'running' as const, startedAt: new Date(), finishedAt: null, error: null }
  await db.insert(appHeatRuns).values({ day, ...started }).onConflictDoUpdate({ target: appHeatRuns.day, set: started })
}

/** Today's Tranco ranks for the published apps' domains, trying twice; the reason when it cannot. */
export async function downloadTranco(deps: Parameters<typeof fetchTrancoRanks>[1] = {}): Promise<TrancoOutcome> {
  const { payload } = await getDb()
  const domains = new Set((await loadPublishedApps(payload)).flatMap(trancoCandidates))
  let error = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return { status: 'fresh', ...(await fetchTrancoRanks(domains, deps)) }
    } catch (cause) {
      error = errorMessage(cause)
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 5_000))
    }
  }
  return { status: 'failed', error }
}

/** Match the stories of the last `mentionDays` days (and today's so far) against the apps. */
export async function syncRecentMentions(day: string) {
  return syncMentions(shanghaiMidnight(addDays(day, -mentionDays)), new Date())
}

type Ranked = { rank: number | null; domain: string | null; listId: string | null }
const unranked: Ranked = { rank: null, domain: null, listId: null }

/**
 * Each app's rank from its latest row up to `day` (the day's own rows when it is run again,
 * otherwise the day before): what the day keeps when Tranco could not be downloaded.
 */
async function previousRanks(appIds: number[], day: string): Promise<Map<number, Ranked>> {
  const { db } = await getDb()
  const rows = await db
    .selectDistinctOn([appMetricsDaily.appId], {
      appId: appMetricsDaily.appId,
      rank: appMetricsDaily.trancoRank,
      domain: appMetricsDaily.trancoDomain,
      listId: appMetricsDaily.trancoListId,
    })
    .from(appMetricsDaily)
    .where(and(inArray(appMetricsDaily.appId, appIds), lte(appMetricsDaily.day, day)))
    .orderBy(appMetricsDaily.appId, desc(appMetricsDaily.day))
  return new Map(rows.map(({ appId, ...ranked }) => [appId, ranked]))
}

/** Score every published app for `day` and replace that day's rows. */
export async function computeHeat(day: string, tranco: TrancoOutcome) {
  const { payload, db } = await getDb()
  const apps = await loadPublishedApps(payload)
  if (apps.length === 0) {
    await db.delete(appMetricsDaily).where(eq(appMetricsDaily.day, day))
    return { apps: 0, trancoListId: tranco.status === 'fresh' ? tranco.listId : null }
  }
  const ids = apps.map((app) => app.id)

  const [clickRows, saves, mentions, before, kept] = await Promise.all([
    db
      .select({ appId: appClicks.appId, count: count() })
      .from(appClicks)
      .where(and(inArray(appClicks.appId, ids), gte(appClicks.day, addDays(day, -engagementDays)), lt(appClicks.day, day)))
      .groupBy(appClicks.appId),
    newSaveCounts('app', shanghaiMidnight(addDays(day, -engagementDays)), shanghaiMidnight(day)),
    mentionCounts(db, shanghaiMidnight(addDays(day, -mentionDays)), shanghaiMidnight(day)),
    db
      .select({ appId: appMetricsDaily.appId, heat: appMetricsDaily.heat })
      .from(appMetricsDaily)
      .where(eq(appMetricsDaily.day, addDays(day, -changeDays))),
    tranco.status === 'fresh' ? Promise.resolve(new Map<number, Ranked>()) : previousRanks(ids, day),
  ])
  const clicks = new Map(clickRows.map((row) => [row.appId, Number(row.count)]))
  const heatBefore = new Map(before.map((row) => [row.appId, row.heat]))

  const ranks = new Map<number, Ranked>(
    apps.map((app) => {
      if (tranco.status === 'failed') return [app.id, kept.get(app.id) ?? unranked]
      const found = trancoRankOf(app, tranco.ranks)
      return [app.id, found ? { ...found, listId: tranco.listId } : { ...unranked, listId: tranco.listId }]
    }),
  )

  const inputs: HeatInput[] = apps.map((app) => ({
    appId: app.id,
    name: app.name,
    categoryId: app.categoryId,
    trancoRank: ranks.get(app.id)?.rank ?? null,
    clicks: clicks.get(app.id) ?? 0,
    saves: saves.get(app.id) ?? 0,
    mentions: mentions.get(app.id) ?? 0,
    heatBefore: heatBefore.get(app.id) ?? null,
  }))
  const byApp = new Map(inputs.map((input) => [input.appId, input]))
  const rows = scoreApps(inputs).map((result) => {
    const input = byApp.get(result.appId)!
    return {
      ...result,
      day,
      categoryId: input.categoryId,
      trancoRank: input.trancoRank,
      trancoDomain: ranks.get(result.appId)?.domain ?? null,
      trancoListId: ranks.get(result.appId)?.listId ?? null,
      clicks: input.clicks,
      saves: input.saves,
      mentions: input.mentions,
    }
  })

  await db.transaction(async (tx) => {
    await tx.delete(appMetricsDaily).where(eq(appMetricsDaily.day, day))
    for (let start = 0; start < rows.length; start += 500) {
      await tx.insert(appMetricsDaily).values(rows.slice(start, start + 500))
    }
  })

  // The list most of the kept ranks came from, for the back office.
  const listIds = rows.map((row) => row.trancoListId).filter((listId) => listId !== null)
  const trancoListId = tranco.status === 'fresh' ? tranco.listId : (mostCommon(listIds) ?? null)
  return { apps: rows.length, trancoListId }
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Close the day's record and refresh the apps pages, which read the new heat. */
export async function finishRun(
  day: string,
  result: { tranco: TrancoOutcome; apps: number; trancoListId: string | null; mentions: number },
): Promise<void> {
  const { db } = await getDb()
  const trancoStatus: TrancoStatus = result.tranco.status === 'fresh' ? 'fresh' : 'reused'
  await db
    .update(appHeatRuns)
    .set({
      status: 'done',
      finishedAt: new Date(),
      trancoStatus,
      trancoListId: result.trancoListId,
      trancoError: result.tranco.status === 'failed' ? result.tranco.error.slice(0, 500) : null,
      apps: result.apps,
      mentions: result.mentions,
      error: null,
    })
    .where(eq(appHeatRuns.day, day))
  refreshAppsCache()
}

/** The job gave up: the back office shows why, and the pages keep the last finished day's heat. */
export async function failRun(day: string, error: string): Promise<void> {
  const { db } = await getDb()
  await db
    .update(appHeatRuns)
    .set({ status: 'failed', finishedAt: new Date(), error: error.slice(0, 500) })
    .where(eq(appHeatRuns.day, day))
}
