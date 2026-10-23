import { inngest } from '@/lib/inngest/client'

import { rollUpSkillStats } from './rollup'

/** Send it from the Inngest dashboard to roll up now rather than at the next hour. */
export const statsRollupEvent = 'skill/stats-rollup'

/**
 * Every hour (docs/specs/resources.md「定时任务与 AI」): installs, the last 7 days, the 7 days
 * before and saves into `skills.stats`, which the list orders and ranks by.
 */
export const rollUpStats = inngest.createFunction(
  {
    id: 'skill-stats-rollup',
    triggers: [{ cron: 'TZ=Asia/Shanghai 7 * * * *' }, { event: statsRollupEvent }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => step.run('roll-up', () => rollUpSkillStats()),
)

export const statsFunctions = [rollUpStats]
