import { ModelCallError } from '@/lib/ai'
import { inngest } from '@/lib/inngest/client'
import { cronWhen } from '@/lib/inngest/cron'
import { modelCallsEnabled } from '@/lib/switches'

import { runBackfill, runChecks, type CheckRun } from './external/checks'
import { BACKFILL_STEP, backfillDailyLimit, liveCheckKinds } from './external/rules'
import type { HeatCheckKind } from '../schema'
import { activeEventIds, refreshHeat } from './heat'
import { judgeSotaBatch } from './sota'
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
 * hours have spread on X (xAI's Grok; the Brave news search stopped 2026-11-07),
 * only stories worth it and each once per channel (X once a day old), then work out those events' heat again. Each channel
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
    const x = await step.run('x', () => runChecks('x'))
    const heat = x.events.length ? await step.run('heat', () => refreshHeat(x.events)) : null
    return { x, heat }
  },
)

/**
 * Once a day (or on `daily/heat.backfill`): catch up on older stories on X (from 2026-11-01)
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
    for (const kind of liveCheckKinds) {
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

/** Batches per run of the SOTA catch-up: 200 stories a day at most. */
const SOTA_BATCHES_PER_RUN = 10

/**
 * Once a day while model calls are on (or on `daily/sota.backfill`): mark the earlier stories
 * that announced a state-of-the-art model (./sota.ts), 20 per model call, until none is left.
 */
export const backfillDailySota = inngest.createFunction(
  {
    id: 'daily-sota-backfill',
    triggers: [...cronWhen(modelCallsEnabled(), '20 5 * * *'), { event: 'daily/sota.backfill' }],
    concurrency: { limit: 1 },
    retries: 1,
  },
  async ({ step }) => {
    if (!modelCallsEnabled()) return { skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    let judged = 0
    const marked: number[] = []
    for (let index = 0; index < SOTA_BATCHES_PER_RUN; index++) {
      const run = await step.run(`batch-${index}`, async () => {
        try {
          return await judgeSotaBatch()
        } catch (error) {
          // The switch went off or the day's budget ran out: try again tomorrow.
          if (error instanceof ModelCallError && !error.retryable) return { judged: 0, marked: [], stopped: error.message }
          throw error
        }
      })
      judged += run.judged
      marked.push(...run.marked.filter((id): id is number => typeof id === 'number'))
      if (!run.judged) break
    }
    return { judged, marked }
  },
)

export const dailyHeatFunctions = [refreshDailyHeat, checkDailyReach, backfillDailyReach, backfillDailySota]
