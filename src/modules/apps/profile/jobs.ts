import { ai } from '@/lib/ai'
import { inngest } from '@/lib/inngest/client'
import { modelCallsEnabled } from '@/lib/switches'
import { errorMessage } from '@/modules/daily/collect/fetch'

import {
  addImages,
  findWaitingDrafts,
  gatherMaterial,
  markFailed,
  markWaiting,
  profileLocaleKeys,
  saveDraft,
  startDraft,
  suggestFacts,
  writeProfile,
  type Written,
} from './draft'
import { draftEvent } from './state'

/**
 * One app's draft: check it is still wanted → fetch the website → facts and the four profiles
 * in parallel → check and save → icon and share image. A newer request for the same app cancels
 * a run still in progress.
 */
export const draftProfileJob = inngest.createFunction(
  {
    id: 'apps-draft-profile',
    triggers: [{ event: draftEvent }],
    concurrency: { limit: 5 },
    singleton: { key: 'event.data.appId', mode: 'cancel' },
    retries: 2,
    onFailure: async ({ event, error }) => {
      await markFailed(Number(event.data.event.data.appId), { code: 'error', detail: errorMessage(error) })
    },
  },
  async ({ event, step }) => {
    const appId = Number(event.data.appId)
    const start = await step.run('start', () => startDraft(appId))
    if (start.status !== 'ready') return start

    const gathered = await step.run('material', () => gatherMaterial(appId))
    if (gathered.status !== 'ready') return gathered
    const { material, categories } = gathered
    const variant = start.requestedAt

    const [facts, profiles] = await Promise.all([
      step.run('facts', () => suggestFacts(appId, material, categories, variant)),
      Promise.all(profileLocaleKeys.map((key) => step.run(`write-${key}`, () => writeProfile(appId, material, key, variant)))),
    ])
    const steps = [facts, ...profiles]
    const blocked = steps.find((result) => result.status === 'blocked')
    if (blocked?.status === 'blocked') {
      await step.run('failed', () => markFailed(appId, blocked.reason))
      return { status: 'failed', reason: blocked.reason }
    }
    const paused = steps.find((result) => result.status === 'paused')
    if (paused?.status === 'paused') {
      await step.run('waiting', () => markWaiting(appId, paused.reason))
      return { status: 'paused', reason: paused.reason }
    }
    if (facts.status !== 'done' || profiles.some((result) => result.status !== 'done')) return { status: 'skipped' }

    const written = Object.fromEntries(
      profileLocaleKeys.map((key, index) => {
        const result = profiles[index]
        return [key, result.status === 'done' ? result.output : null]
      }),
    ) as Written
    const models = steps.map((result) => (result.status === 'done' ? result.model : '')).filter(Boolean)
    const saved = await step.run('save', () =>
      saveDraft(appId, { requestedAt: variant, material, categories, facts: facts.output, written, models }),
    )
    if (saved.status !== 'drafted') return saved
    const images = await step.run('images', () => addImages(appId, material))
    return { ...saved, images }
  },
)

/**
 * Every 20 minutes (or on `apps/draft.sweep`): drafts still waiting, e.g. queued while model
 * calls were off or after the day's budget ran out, or whose event never arrived.
 */
export const draftSweep = inngest.createFunction(
  { id: 'apps-draft-sweep', triggers: [{ cron: '5,25,45 * * * *' }, { event: 'apps/draft.sweep' }] },
  async ({ step }) => {
    if (!modelCallsEnabled()) return { skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    const usage = await step.run('usage', () => ai.usageToday())
    if (usage.costUsd >= usage.budgetUsd) return { skipped: 'daily model budget used up' }
    const appIds = await step.run('find-waiting', () => findWaitingDrafts(new Date()))
    if (appIds.length) {
      await step.sendEvent(
        'draft',
        appIds.map((appId) => ({ name: draftEvent, data: { appId } })),
      )
    }
    return { queued: appIds.length }
  },
)

export const appsProfileFunctions = [draftProfileJob, draftSweep]
