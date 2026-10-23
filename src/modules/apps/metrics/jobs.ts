import { inngest } from '@/lib/inngest/client'
import { shanghaiDate } from '@/lib/shanghai-day'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { refreshAppsCache } from '../cache'
import { heatEvent } from './admin'
import { storyWindow, syncMentions } from './mentions'
import { computeHeat, downloadTranco, failRun, finishRun, startRun, syncRecentMentions } from './run'

/** Sent by the daily review screen (src/modules/daily/review/endpoints.ts) with { storyId, change }. */
const storyChangedEvent = 'daily/story.changed'

/**
 * Every day at 06:00 Shanghai time (docs/specs/apps.md rule 7): download the Tranco list (or
 * keep yesterday's ranks), match the daily stories, then score every published app and
 * refresh the apps pages. Running it again the same day replaces that day's numbers.
 */
export const heatDaily = inngest.createFunction(
  {
    id: 'apps-heat-daily',
    triggers: [{ cron: 'TZ=Asia/Shanghai 0 6 * * *' }, { event: heatEvent }],
    concurrency: { limit: 1 },
    retries: 2,
    onFailure: async ({ error }) => {
      await failRun(shanghaiDate(), errorMessage(error))
    },
  },
  async ({ step }) => {
    const day = await step.run('start', async () => {
      const today = shanghaiDate()
      await startRun(today)
      return today
    })
    const tranco = await step.run('tranco', () => downloadTranco())
    const mentions = await step.run('mentions', () => syncRecentMentions(day))
    const heat = await step.run('heat', () => computeHeat(day, tranco))
    await step.run('finish', () => finishRun(day, { tranco, ...heat, mentions: mentions.mentions }))
    return {
      day,
      tranco: tranco.status === 'fresh' ? tranco.listId : `kept (${tranco.error})`,
      apps: heat.apps,
      mentions: mentions.mentions,
    }
  },
)

/**
 * A daily story went on or off the site, or its text or sources changed: match the stories
 * around it again, so「日报里提到它」and the daily list's「今天提到的应用」follow at once rather
 * than at the next 06:00 run. Heat still counts mentions at that run, as before.
 */
export const mentionsOnStoryChange = inngest.createFunction(
  {
    id: 'apps-mentions-story-changed',
    triggers: [{ event: storyChangedEvent }],
    // Each run matches a moment or two; one at a time keeps two edits of a story in order.
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ event, step }) => {
    const storyId = Number(event.data.storyId)
    if (!Number.isInteger(storyId)) return { skipped: 'no storyId' }
    const window = await step.run('window', () => storyWindow(storyId))
    if (!window) return { storyId, skipped: 'no such story' }
    const matched = await step.run('match', async () => {
      const result = await syncMentions(new Date(window.since), new Date(window.until))
      refreshAppsCache()
      return result
    })
    return { storyId, change: event.data.change, ...window, ...matched }
  },
)

export const appsHeatFunctions = [heatDaily, mentionsOnStoryChange]
