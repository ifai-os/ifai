import { inngest } from '@/lib/inngest/client'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { cleanUp } from './cleanup'
import { BATCH_SIZE } from './delivery'
import { abandonRun, chunks, claimDue, planRun, sendClaimed, stopRun } from './send'

/** Runs the morning send now, for a manual run from the Inngest dashboard. */
export const dailyEmailRunEvent = 'daily/email.run'

/**
 * Every 15 minutes (docs/specs/daily-email.md「定时任务」): everyone between 8:00 and 11:00 where
 * they are who has not had today's email gets it. Plan and claim are steps, so a retry keeps
 * the run's moment, its stories and its rows; each batch is a step with its own idempotency
 * key. One run at a time. No model calls.
 */
export const sendDailyEmails = inngest.createFunction(
  {
    id: 'daily-email-send',
    triggers: [{ cron: 'TZ=UTC 0,15,30,45 * * * *' }, { event: dailyEmailRunEvent }],
    concurrency: { limit: 1 },
    retries: 3,
    onFailure: async ({ event, error }) => {
      await abandonRun(event.data.run_id, errorMessage(error))
    },
  },
  async ({ step, runId }) => {
    const plan = await step.run('plan', () => planRun(new Date()))
    if (plan.status !== 'ready') return { status: plan.status }
    const ids = await step.run('claim', () => claimDue(plan, runId))
    if (!ids.length) return { status: 'none_due' }

    let sent = 0
    let failed = 0
    for (const [index, batch] of chunks(ids, BATCH_SIZE).entries()) {
      const result = await step.run(`send-${index + 1}`, () => sendClaimed(batch, plan, `daily-email/${runId}/${index + 1}`))
      sent += result.sent
      failed += result.failed
      if (result.stop) {
        const stopped = result.stop
        const left = await step.run('stop', () => stopRun(runId, stopped))
        return { status: 'stopped', reason: stopped.message, sent, failed, left }
      }
    }
    return { status: 'done', stories: plan.stories.length, sent, failed }
  },
)

/**
 * Every day at 04:30 UTC: unsubscribed subscriptions 30 days on (rule 10, the send numbers
 * stay without them), rate-limit rows after a day, webhook ids after a week, and claims that
 * never finished.
 */
export const cleanUpDailyEmail = inngest.createFunction(
  { id: 'daily-email-cleanup', triggers: [{ cron: 'TZ=UTC 30 4 * * *' }], concurrency: { limit: 1 }, retries: 2 },
  async ({ step }) => step.run('clean', () => cleanUp(new Date())),
)

export const dailyEmailFunctions = [sendDailyEmails, cleanUpDailyEmail]
