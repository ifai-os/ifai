import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'

import { cleanUpAgents } from './data'

/**
 * Every day at 04:40 UTC (docs/specs/agents.md「定时任务」): request counts older than two days,
 * and keys that ran out more than 30 days ago. No model calls.
 */
export const cleanUpAgentsJob = inngest.createFunction(
  { id: 'agents-cleanup', triggers: [{ cron: 'TZ=UTC 40 4 * * *' }], concurrency: { limit: 1 }, retries: 2 },
  async ({ step }) =>
    step.run('clean', async () => {
      const { payload } = await getDb()
      return cleanUpAgents(payload, new Date())
    }),
)

export const agentsFunctions = [cleanUpAgentsJob]
