import { inngest } from '@/lib/inngest/client'
import { shanghaiDate } from '@/lib/shanghai-day'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { heatEvent } from './admin'
import { computeHeat, downloadTranco, failRun, finishRun, startRun, syncRecentMentions } from './run'

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

export const appsHeatFunctions = [heatDaily]
