import config from '@payload-config'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { eq } from '@payloadcms/db-postgres/drizzle'
import { RetryAfterError } from 'inngest'
import { getPayload, type Payload } from 'payload'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import { ModelCallError, ReceiptExhaustedError } from '@/lib/ai/errors'
import { shanghaiDate } from '@/lib/shanghai-day'

import { reviewTranslatePrompt } from '../prompts/review-translate'
import { appReviews } from '../schema'
import { isReviewable } from './data'
import type { ModelLocale } from './rules'
import { keptTexts, modelTargets, runsLeft, storeTranslation, translationState, untranslatedReviews } from './translations'

/**
 * The translation job's steps (./jobs.ts, docs/specs/apps.md 5c): check the review still needs
 * one → one model call → keep the real translations and store them with the text they came from.
 * A text the model keeps failing on is marked failed and waits for「重新翻译」.
 */

export type TranslateDeps = { ai?: Ai; payload?: Payload; now?: () => Date }

const payloadOf = async (deps: TranslateDeps) => deps.payload ?? getPayload({ config })
const nowOf = (deps: TranslateDeps) => deps.now?.() ?? new Date()

export type Started =
  | { status: 'ready'; app: string; body: string; targets: ModelLocale[]; today: string; runs: number; counted: boolean }
  | { status: 'skipped'; reason: string }

/**
 * The review must be shown, on a published app, and lack a translation of the text it has now,
 * with paid runs left today. `retry` (「重新翻译」) translates it again whatever is stored, and its
 * call does not count toward the day's runs: the limit is for readers editing, not the site owner.
 */
export async function startTranslation(reviewId: number, retry: boolean, deps: TranslateDeps = {}): Promise<Started> {
  const payload = await payloadOf(deps)
  const [review] = await (payload.db as unknown as PostgresAdapter).drizzle
    .select({ appId: appReviews.appId, body: appReviews.body, lang: appReviews.lang, status: appReviews.status })
    .from(appReviews)
    .where(eq(appReviews.id, reviewId))
    .limit(1)
  if (!review) return { status: 'skipped', reason: 'no such review' }
  if (review.status !== 'shown') return { status: 'skipped', reason: 'the review is hidden' }
  if (!(await isReviewable(payload, review.appId))) return { status: 'skipped', reason: 'the app is not published' }

  const state = await translationState(payload, reviewId)
  if (!retry && state?.source === review.body) {
    return { status: 'skipped', reason: state.status === 'done' ? 'already translated' : 'failed on this text; waiting for 重新翻译' }
  }
  const today = shanghaiDate(nowOf(deps))
  if (!retry && runsLeft(state, today) === 0) return { status: 'skipped', reason: 'no paid runs left today' }

  const app = await payload.findByID({ collection: 'apps', id: review.appId, depth: 0, select: { name: true } })
  return {
    status: 'ready',
    app: app.name,
    body: review.body,
    targets: modelTargets(review.lang),
    today,
    runs: state?.runsDay === today ? state.runs : 0,
    counted: !retry,
  }
}

export type Translated =
  | { status: 'done'; output: Record<string, string>; model: string; reused: boolean }
  | { status: 'paused'; reason: string }
  | { status: 'blocked'; reason: string }

/**
 * The model call, its failures by kind (as in the profile drafts): a call running elsewhere is
 * retried after a pause; a closed switch, spent budget or missing key leaves the review for the
 * sweep; a call that failed three times is blocked. Other errors throw, so Inngest retries them
 * until the receipt runs out of attempts.
 */
export async function translateReview(
  reviewId: number,
  review: { app: string; body: string; targets: ModelLocale[] },
  variant: string | undefined,
  deps: TranslateDeps = {},
): Promise<Translated> {
  try {
    const { output, model, reused } = await (deps.ai ?? defaultAi).object({
      purpose: 'translate',
      subject: `app_reviews:${reviewId}`,
      variant,
      instructions: reviewTranslatePrompt.instructions,
      prompt: reviewTranslatePrompt.build(review, review.targets),
      schema: reviewTranslatePrompt.schema(review.targets),
      temperature: 0.2,
      maxOutputTokens: 8000,
    })
    return { status: 'done', output, model, reused }
  } catch (error) {
    if (!(error instanceof ModelCallError)) throw error
    if (error.retryable) throw new RetryAfterError(error.message, '2m')
    return { status: error instanceof ReceiptExhaustedError ? 'blocked' : 'paused', reason: error.message }
  }
}

export type Saved = { status: 'translated'; languages: string[] } | { status: 'failed'; reason: string } | { status: 'skipped'; reason: string }

/** Stores the translations, or the failure, for the text the job started from. */
export async function saveTranslation(
  reviewId: number,
  started: Extract<Started, { status: 'ready' }>,
  translated: Extract<Translated, { status: 'done' | 'blocked' }>,
  deps: TranslateDeps = {},
): Promise<Saved> {
  const payload = await payloadOf(deps)
  if (translated.status === 'blocked') {
    const stored = await storeTranslation(payload, reviewId, started.body, { status: 'failed', error: translated.reason })
    return stored ? { status: 'failed', reason: translated.reason } : { status: 'skipped', reason: 'the review changed meanwhile' }
  }
  const texts = keptTexts(started.body, started.targets, translated.output)
  const stored = await storeTranslation(payload, reviewId, started.body, {
    status: 'done',
    texts,
    language: translated.output.language ?? '',
    model: translated.model,
    runsDay: started.today,
    // A reused receipt cost nothing, so it does not count toward the day's runs.
    runs: started.runs + (started.counted && !translated.reused ? 1 : 0),
  })
  return stored ? { status: 'translated', languages: Object.keys(texts) } : { status: 'skipped', reason: 'the review changed meanwhile' }
}

/** Reviews for the sweep: shown, of a published app, without a translation of their text, untouched for 10 minutes. */
export async function findUntranslated(deps: TranslateDeps = {}): Promise<number[]> {
  const payload = await payloadOf(deps)
  const now = nowOf(deps)
  return untranslatedReviews(payload, new Date(now.getTime() - 10 * 60_000), shanghaiDate(now))
}
