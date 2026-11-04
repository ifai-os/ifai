import { inngest } from '@/lib/inngest/client'

import { runBackfill, runChecks, type CheckRun } from './external/checks'
import { BACKFILL_STEP, backfillDailyLimit } from './external/rules'
import type { HeatCheckKind } from '../schema'
import { activeEventIds, refreshHeat } from './heat'
import { syncEventSources } from './sources'

/**
 * Every hour (or on `daily/heat.refresh`): add later reports and Hacker News threads to the
 * stories' sources, then work out the heat of every event active in the last 54 hours. No
 * model calls, so it runs whatever the switches say: heat has to fade even when nothing new
 * comes in.
 */
export const refreshDailyHeat = inngest.createFunction(
  {
    id: 'daily-heat-refresh',
    triggers: [{ cron: '5 * * * *' }, { event: 'daily/heat.refresh' }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => {
    const eventIds = await step.run('find-events', () => activeEventIds())
    if (!eventIds.length) return { events: 0 }
    const sources = await step.run('sync-sources', () => syncEventSources(eventIds))
    const heat = await step.run('heat', () => refreshHeat(eventIds))
    return { events: eventIds.length, sources, heat }
  },
)

/**
 * Every 2 hours (or on `daily/heat.check`): check how far the hottest stories of the last 48
 * hours have spread outside our sources, with a news search (Brave) and a search of X (xAI),
 * each story at most every 12 hours, then work out those events' heat again. Each channel
 * stays off until its key is set (./external/checks.ts).
 */
export const checkDailyReach = inngest.createFunction(
  {
    id: 'daily-heat-check',
    triggers: [{ cron: '35 */2 * * *' }, { event: 'daily/heat.check' }],
    concurrency: { limit: 1 },
    retries: 1,
  },
  async ({ step }) => {
    const search = await step.run('search', () => runChecks('search'))
    const x = await step.run('x', () => runChecks('x'))
    const eventIds = [...new Set([...search.events, ...x.events])]
    const heat = eventIds.length ? await step.run('heat', () => refreshHeat(eventIds)) : null
    return { search, x, heat }
  },
)

/**
 * Once a day (or on `daily/heat.backfill`): catch up on older stories with both channels
 * (./external/rules.ts「backfill」), newest first, up to each channel's daily share
 * (HEAT_SEARCH_BACKFILL_DAILY_LIMIT, HEAT_X_BACKFILL_DAILY_LIMIT) in steps of 10, then work out
 * those events' heat again so their reach index takes the checks in. Does nothing until the
 * keys are set; stops on its own once every story from HEAT_BACKFILL_SINCE has been checked.
 */
export const backfillDailyReach = inngest.createFunction(
  {
    id: 'daily-heat-backfill',
    triggers: [{ cron: '50 4 * * *' }, { event: 'daily/heat.backfill' }],
    concurrency: { limit: 1 },
    retries: 1,
  },
  async ({ step }) => {
    const now = await step.run('now', () => new Date().toISOString())
    const runs: Partial<Record<HeatCheckKind, { checked: number; failed: number; stopped?: string }>> = {}
    const eventIds = new Set<number>()
    for (const kind of ['search', 'x'] as const) {
      const limit = backfillDailyLimit(kind)
      const total = { checked: 0, failed: 0, stopped: undefined as string | undefined }
      for (let index = 0; total.checked < limit; index++) {
        const run: CheckRun = await step.run(`${kind}-${index}`, () => runBackfill(kind, Math.min(BACKFILL_STEP, limit - total.checked), new Date(now)))
        total.checked += run.checked
        total.failed += run.failed
        for (const id of run.events) eventIds.add(id)
        // Nothing left to check, the channel is off, or a whole step failed: try again tomorrow.
        if (run.stopped || run.checked === 0) {
          total.stopped = run.stopped
          break
        }
      }
      runs[kind] = total
    }
    const heat = eventIds.size ? await step.run('heat', () => refreshHeat([...eventIds])) : null
    return { ...runs, heat }
  },
)

export const dailyHeatFunctions = [refreshDailyHeat, checkDailyReach, backfillDailyReach]
