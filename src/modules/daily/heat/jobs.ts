import { inngest } from '@/lib/inngest/client'

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

export const dailyHeatFunctions = [refreshDailyHeat]
