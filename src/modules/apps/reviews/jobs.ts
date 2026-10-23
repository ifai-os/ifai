import { ai } from '@/lib/ai'
import { inngest } from '@/lib/inngest/client'
import { modelCallsEnabled } from '@/lib/switches'

import { findUntranslated, saveTranslation, startTranslation, translateReview } from './translate'
import { translateEvent, translateSweepEvent } from './translations'

/**
 * One review's translations (docs/specs/apps.md 5c): still needed → one model call → store.
 * Edits a minute apart are one run, with the latest text. Four tries in all: by the fourth the
 * call's receipt is out of attempts, so the review is marked failed rather than left waiting.
 */
export const translateJob = inngest.createFunction(
  {
    id: 'apps-review-translate',
    triggers: [{ event: translateEvent }],
    concurrency: { limit: 5 },
    debounce: { key: 'event.data.reviewId', period: '1m', timeout: '5m' },
    retries: 3,
  },
  async ({ event, step }) => {
    const reviewId = Number(event.data.reviewId)
    const variant = typeof event.data.variant === 'string' ? event.data.variant : undefined
    const started = await step.run('start', () => startTranslation(reviewId, Boolean(variant)))
    if (started.status !== 'ready') return started
    const translated = await step.run('translate', () => translateReview(reviewId, started, variant))
    if (translated.status === 'paused') return translated
    return step.run('save', () => saveTranslation(reviewId, started, translated))
  },
)

/**
 * Every 30 minutes (or on `apps/translate.sweep`): shown reviews still without a translation of
 * their text, e.g. written while model calls were off or after the day's budget ran out.
 */
export const translateSweep = inngest.createFunction(
  { id: 'apps-review-translate-sweep', triggers: [{ cron: '20,50 * * * *' }, { event: translateSweepEvent }] },
  async ({ step }) => {
    if (!modelCallsEnabled()) return { skipped: 'MODEL_CALLS_ENABLED is not "true"' }
    const usage = await step.run('usage', () => ai.usageToday())
    if (usage.costUsd >= usage.budgetUsd) return { skipped: 'daily model budget used up' }
    const reviewIds = await step.run('find-untranslated', () => findUntranslated())
    if (reviewIds.length) {
      await step.sendEvent(
        'translate',
        reviewIds.map((reviewId) => ({ name: translateEvent, data: { reviewId } })),
      )
    }
    return { queued: reviewIds.length }
  },
)

export const appsReviewFunctions = [translateJob, translateSweep]
