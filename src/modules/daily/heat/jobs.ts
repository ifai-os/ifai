import { inngest } from '@/lib/inngest/client'

import { runChecks } from './external/checks'
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

export const dailyHeatFunctions = [refreshDailyHeat, checkDailyReach]
