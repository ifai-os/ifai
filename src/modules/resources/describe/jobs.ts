import { ai } from '@/lib/ai'
import { inngest } from '@/lib/inngest/client'
import { modelCallsEnabled } from '@/lib/switches'
import { errorMessage } from '@/modules/daily/collect/fetch'

import {
  describeLocaleKeys,
  extractDeclarations,
  findWaitingDescribes,
  gatherMaterial,
  markFailed,
  markWaiting,
  saveDescription,
  startDescribe,
  writeDescription,
  type Written,
} from './draft'
import { describeEvent } from './state'

/**
 * One version's description draft: check it is still wanted → SKILL.md, README and file list →
 * declarations and the four languages in parallel → check and save. A newer request for the
 * same version cancels a run still in progress.
 */
export const describeJob = inngest.createFunction(
  {
    id: 'skill-describe',
    triggers: [{ event: describeEvent }],
    concurrency: { limit: 4 },
    singleton: { key: 'event.data.versionId', mode: 'cancel' },
    retries: 2,
    onFailure: async ({ event, error }) => {
      await markFailed(Number(event.data.event.data.versionId), { code: 'error', detail: errorMessage(error) })
    },
  },
  async ({ event, step }) => {
    const versionId = Number(event.data.versionId)
    const start = await step.run('start', () => startDescribe(versionId))
    if (start.status !== 'ready') return start

    const gathered = await step.run('material', () => gatherMaterial(versionId))
    if (gathered.status !== 'ready') return gathered
    const { material } = gathered
    const variant = start.requestedAt

    const [facts, texts] = await Promise.all([
      step.run('declarations', () => extractDeclarations(versionId, material, variant)),
      Promise.all(describeLocaleKeys.map((key) => step.run(`write-${key}`, () => writeDescription(versionId, material, key, variant)))),
    ])
    const results = [facts, ...texts]
    const blocked = results.find((result) => result.status === 'blocked')
    if (blocked?.status === 'blocked') {
      await step.run('failed', () => markFailed(versionId, blocked.reason))
      return { status: 'failed', reason: blocked.reason }
    }
    const paused = results.find((result) => result.status === 'paused')
    if (paused?.status === 'paused') {
      await step.run('waiting', () => markWaiting(versionId, paused.reason))
      return { status: 'paused', reason: paused.reason }
    }
    if (facts.status !== 'done' || texts.some((result) => result.status !== 'done')) return { status: 'skipped' }

    const written = Object.fromEntries(
      describeLocaleKeys.map((key, index) => {
        const result = texts[index]
        return [key, result.status === 'done' ? result.output : null]
      }),
    ) as Written
    const models = results.map((result) => (result.status === 'done' ? result.model : '')).filter(Boolean)
    return step.run('save', () => saveDescription(versionId, { requestedAt: variant, material, facts: facts.output, written, models }))
  },
)

/**
 * Every 20 minutes (or on `skill/describe.sweep`): drafts still waiting, e.g. queued while model
 * calls were off or after the day's budget ran out, or whose event never arrived.
 */
export const describeSweep = inngest.createFunction(
  { id: 'skill-describe-sweep', triggers: [{ cron: '10,30,50 * * * *' }, { event: 'skill/describe.sweep' }] },
  async ({ step }) => {
    if (!modelCallsEnabled()) return { skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    const usage = await step.run('usage', () => ai.usageToday())
    if (usage.costUsd >= usage.budgetUsd) return { skipped: 'daily model budget used up' }
    const versionIds = await step.run('find-waiting', () => findWaitingDescribes(new Date()))
    if (versionIds.length) {
      await step.sendEvent(
        'describe',
        versionIds.map((versionId) => ({ name: describeEvent, data: { versionId } })),
      )
    }
    return { queued: versionIds.length }
  },
)

export const describeFunctions = [describeJob, describeSweep]
