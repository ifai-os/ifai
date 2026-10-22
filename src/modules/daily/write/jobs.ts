import { inngest } from '@/lib/inngest/client'
import { modelCallsEnabled } from '@/lib/switches'

import { guarded } from '../judge/jobs'
import { findUnwritten, writeStory } from './write'

/** One queued report → a story awaiting review (four languages plus converted zh-Hant). */
export const writeStoryJob = inngest.createFunction(
  { id: 'daily-write-story', triggers: [{ event: 'daily/story.write' }], concurrency: 2, retries: 2 },
  async ({ event, step }) => {
    if (!modelCallsEnabled()) return { status: 'paused', reason: 'MODEL_CALLS_ENABLED is not "true"' }
    const itemId = Number(event.data.itemId)
    return step.run('write', () => guarded(itemId, () => writeStory(itemId)))
  },
)

/** Every 30 minutes (or on `daily/write.sweep`): queued reports whose story was never written. */
export const writeSweep = inngest.createFunction(
  { id: 'daily-write-sweep', triggers: [{ cron: '15,45 * * * *' }, { event: 'daily/write.sweep' }] },
  async ({ step }) => {
    if (!modelCallsEnabled()) return { skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    const itemIds = await step.run('find-unwritten', () => findUnwritten(new Date()))
    if (itemIds.length) {
      await step.sendEvent(
        'write',
        itemIds.map((itemId) => ({ name: 'daily/story.write', data: { itemId } })),
      )
    }
    return { queued: itemIds.length }
  },
)

export const dailyWriteFunctions = [writeStoryJob, writeSweep]
