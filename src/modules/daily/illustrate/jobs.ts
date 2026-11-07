import { inngest } from '@/lib/inngest/client'
import { cronWhen } from '@/lib/inngest/cron'
import { ModelCallError } from '@/lib/ai'
import { modelCallsEnabled, storyIllustrationsEnabled } from '@/lib/switches'

import { findUnillustrated, illustrateStory, illustrationsStartedToday } from './illustrate'
import { illustrationsPerDay, sweepSize } from './rules'

export const ILLUSTRATE_EVENT = 'daily/story.illustrate'

/** Why nothing is drawn, or null when both switches are on. */
function paused(): string | null {
  if (!storyIllustrationsEnabled()) return 'STORY_ILLUSTRATIONS_ENABLED is not "true"'
  if (!modelCallsEnabled()) return 'MODEL_CALLS_ENABLED is not "true"'
  return null
}

/** One story's picture (docs/specs/daily.md「AI 配图」). A closed switch or spent budget leaves it for a later sweep. */
export const illustrateStoryJob = inngest.createFunction(
  { id: 'daily-illustrate-story', triggers: [{ event: ILLUSTRATE_EVENT }], concurrency: 2, retries: 1 },
  async ({ event, step }) => {
    const reason = paused()
    if (reason) return { status: 'paused', reason }
    const storyId = Number(event.data.storyId)
    if (!Number.isInteger(storyId)) return { status: 'skipped', reason: 'bad event' }
    return step.run('draw', async () => {
      try {
        return await illustrateStory(storyId)
      } catch (error) {
        if (error instanceof ModelCallError) return { status: 'paused', reason: error.message }
        throw error
      }
    })
  },
)

/** Every 20 minutes (or on `daily/illustrate.sweep`): a few stories without a picture, within the daily limit. */
export const illustrateSweep = inngest.createFunction(
  { id: 'daily-illustrate-sweep', triggers: [...cronWhen(!paused(), '5,25,45 * * * *'), { event: 'daily/illustrate.sweep' }] },
  async ({ step }) => {
    const reason = paused()
    if (reason) return { skipped: reason }
    const storyIds = await step.run('find-unillustrated', async () => {
      const now = new Date()
      return findUnillustrated(now, sweepSize(illustrationsPerDay(), await illustrationsStartedToday(now)))
    })
    if (storyIds.length) await step.sendEvent('illustrate', storyIds.map((storyId) => ({ name: ILLUSTRATE_EVENT, data: { storyId } })))
    return { queued: storyIds.length }
  },
)

export const dailyIllustrateFunctions = [illustrateStoryJob, illustrateSweep]
