import { getDb } from '@/lib/db/drizzle'
import { inngest } from '@/lib/inngest/client'

import { emailSubmitter, markNotified, submissionsToNotify } from './notify'
import { submissionNotifyEvent } from './rules'

/**
 * `apps/submission-notify` {id}: sent by the submissions collection when a submission is new or
 * its status is not the one its submitter was last told about (docs/specs/apps.md 5e). Sending and
 * recording are separate steps, so a retry after a failed record does not send twice; one run
 * per submission at a time, so two quick saves send one email.
 */
export const notifySubmitter = inngest.createFunction(
  {
    id: 'apps-submission-notify',
    triggers: [{ event: submissionNotifyEvent }],
    concurrency: { key: 'event.data.id', limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const id = Number(event.data.id)
    if (!Number.isInteger(id)) return { sent: null }
    const sent = await step.run('send', async () => emailSubmitter((await getDb()).payload, id))
    if (sent) await step.run('record', async () => markNotified((await getDb()).payload, id, sent))
    return { sent }
  },
)

/** Every hour: the emails whose event never reached Inngest (it was down when the submission was saved). */
export const notifySweep = inngest.createFunction(
  { id: 'apps-submission-notify-sweep', triggers: [{ cron: 'TZ=Asia/Shanghai 41 * * * *' }], concurrency: { limit: 1 } },
  async ({ step }) => {
    const ids = await step.run('find', async () => submissionsToNotify((await getDb()).payload))
    if (ids.length) await step.sendEvent('notify', ids.map((id) => ({ name: submissionNotifyEvent, data: { id } })))
    return { queued: ids.length }
  },
)

export const appsSubmissionFunctions = [notifySubmitter, notifySweep]
