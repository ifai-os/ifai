import { inngest } from '@/lib/inngest/client'

import { checkStale } from './alert'

/**
 * Every 3 hours (or on `daily/stale.check`): email the admins when nothing new has been published
 * for DAILY_STALE_ALERT_HOURS (./rules.ts). No model calls; production only unless DAILY_STALE_ALERT=on.
 */
export const checkDailyStale = inngest.createFunction(
  {
    id: 'daily-stale-check',
    triggers: [{ cron: 'TZ=UTC 20 */3 * * *' }, { event: 'daily/stale.check' }],
    concurrency: { limit: 1 },
    retries: 1,
  },
  async ({ step }) => {
    const now = await step.run('now', () => new Date().toISOString())
    return step.run('check', () => checkStale(new Date(now)))
  },
)

export const dailyWatchFunctions = [checkDailyStale]
