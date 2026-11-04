import { inngest } from '@/lib/inngest/client'
import { modelCallsEnabled } from '@/lib/switches'

import { refreshDailyCache } from '../review/cache'
import { assignStoryline, unassignedStories } from './assign'

/** Sent by hand (the Inngest dashboard, or `pnpm inngest`) to go over the earlier stories once. */
export const STORYLINE_BACKFILL_EVENT = 'daily/storylines.backfill'

/** Sent when a story goes on the site or changes (src/modules/daily/review/endpoints.ts, ../import/import.ts). */
const storyChangedEvent = 'daily/story.changed'

/** Both jobs share one queue: one assignment runs at a time, so two never open the same storyline twice. */
const oneAtATime = { scope: 'env' as const, key: '"daily-storylines"', limit: 1 }

/**
 * A story went on the site (or an imported one was updated): put it on its ongoing storyline
 * (docs/specs/daily.md「持续事件」). One at a time, so a batch of imports builds storylines in
 * order and two stories never open the same storyline twice.
 */
export const assignStorylineJob = inngest.createFunction(
  { id: 'daily-storyline-assign', triggers: [{ event: storyChangedEvent }], concurrency: oneAtATime, retries: 2 },
  async ({ event, step }) => {
    const storyId = Number(event.data.storyId)
    if (!Number.isInteger(storyId)) return { skipped: 'no storyId' }
    if (event.data.change !== 'published' && event.data.change !== 'corrected') return { storyId, skipped: `change ${event.data.change}` }
    if (!modelCallsEnabled()) return { storyId, skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    return step.run('assign', () => assignStoryline(storyId))
  },
)

/**
 * Earlier stories: every published story of the last 90 days without a storyline, oldest first,
 * as if each had just been published, so storylines grow in the order things happened. One step
 * per story, so a retry picks up where it stopped; the receipts keep a repeated call free.
 */
export const backfillStorylinesJob = inngest.createFunction(
  { id: 'daily-storyline-backfill', triggers: [{ event: STORYLINE_BACKFILL_EVENT }], concurrency: oneAtATime, retries: 1 },
  async ({ step }) => {
    if (!modelCallsEnabled()) return { skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    const ids = await step.run('find', () => unassignedStories(new Date()))
    const outcomes: Record<string, number> = {}
    for (const id of ids) {
      const outcome = await step.run(`assign-${id}`, () => assignStoryline(id, { refresh: false }))
      const key = outcome.status === 'done' ? outcome.decision : 'skipped'
      outcomes[key] = (outcomes[key] ?? 0) + 1
    }
    await step.run('refresh', () => refreshDailyCache())
    return { stories: ids.length, ...outcomes }
  },
)

export const dailyStorylineFunctions = [assignStorylineJob, backfillStorylinesJob]
