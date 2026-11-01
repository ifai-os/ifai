import { inngest } from '@/lib/inngest/client'
import { shanghaiDate } from '@/lib/shanghai-day'
import { modelCallsEnabled } from '@/lib/switches'

import { arenaBudgetUsedUp, generateAnswer, nextAnswers, queueMissingAnswers } from './answers/generate'
import { refreshRankingsCache } from './cache'
import { answersEvent, snapshotEvent } from './events'
import { externalFunctions } from './external/jobs'
import { weekOf } from './rules'
import { deleteUnvotedBattles, publishedArenaIds, storeSnapshot } from './snapshot'

/**
 * Every 30 minutes, and when the back office saves a model or a question or asks for「现在生成」
 * (docs/specs/rankings.md「定时任务与 AI」): add the missing answers as waiting, then generate up to
 * 30 of them, one step each. A closed switch or a spent budget stops the run; the next one goes on.
 * One run at a time: a request while one is running is skipped, the run or the next one covers it.
 */
export const answersJob = inngest.createFunction(
  {
    id: 'rankings-answers',
    triggers: [{ cron: '10,40 * * * *' }, { event: answersEvent }],
    singleton: { mode: 'skip' },
    retries: 2,
  },
  async ({ step }) => {
    const queued = await step.run('queue-missing', () => queueMissingAnswers())
    if (!modelCallsEnabled()) return { queued, skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    const budget = await step.run('arena-budget', () => arenaBudgetUsedUp())
    if (budget) return { queued, skipped: 'ARENA_DAILY_BUDGET_USD used up', ...budget }
    const ids = await step.run('next-answers', () => nextAnswers())
    const outcomes: Record<string, number> = {}
    for (const id of ids) {
      const generated = await step.run(`answer-${id}`, () => generateAnswer(id))
      outcomes[generated.status] = (outcomes[generated.status] ?? 0) + 1
      if (generated.status === 'paused') return { queued, ...outcomes, paused: generated.reason }
    }
    return { queued, ...outcomes }
  },
)

/**
 * Every Monday at 06:00 Shanghai time, and on「现在重算」: drop the questions nobody voted on, store
 * this week's snapshot of every published arena, then refresh the rankings pages.
 */
export const snapshotJob = inngest.createFunction(
  {
    id: 'rankings-snapshot',
    triggers: [{ cron: 'TZ=Asia/Shanghai 0 6 * * 1' }, { event: snapshotEvent }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => {
    const week = await step.run('week', () => weekOf(shanghaiDate()))
    const deleted = await step.run('delete-unvoted', () => deleteUnvotedBattles())
    const arenaIds = await step.run('arenas', () => publishedArenaIds())
    const arenas = []
    for (const arenaId of arenaIds) arenas.push(await step.run(`snapshot-${arenaId}`, () => storeSnapshot(arenaId, week)))
    await step.run('refresh-pages', () => {
      refreshRankingsCache()
      return true
    })
    return { week, deleted, arenas }
  },
)

export const rankingsFunctions = [answersJob, snapshotJob, ...externalFunctions]
