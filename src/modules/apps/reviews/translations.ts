import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, desc, eq, isNull, lt, ne, or, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import type { Locale } from '@/i18n/config'
import { toHans, toHant } from '@/lib/i18n/hant'
import { inngest } from '@/lib/inngest/client'

import { appReviews, appReviewTranslations } from '../schema'
import { cleanText, modelLocales, reviewRules, type ModelLocale, type TranslatedTexts, type TranslationStatus } from './rules'

/**
 * Machine translations of reviews (docs/specs/apps.md 5c): which languages a review needs from
 * the model, what is kept of its answer, and the text a reader gets in their page's language: the
 * model's (zh-Hant converted from its zh-Hans), or between the two Chinese forms OpenCC alone.
 * Works on the Payload instance it is given and stays free of the Payload config and the model
 * client, so the API routes, the back office and the job (./translate) can all use it.
 */

export const translateEvent = 'apps/review.translate'
export const translateSweepEvent = 'apps/translate.sweep'

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/**
 * Hands a review to the translation job; `variant` asks for a new call instead of the stored one
 * (the back office's「重新翻译」). A failed send only delays the translation until the sweep.
 */
export async function queueTranslation(reviewId: number, variant?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await inngest.send({ name: translateEvent, data: variant ? { reviewId, variant } : { reviewId } })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`${translateEvent} not sent:`, message)
    return { ok: false, error: message }
  }
}

/**
 * The languages to ask the model for: all but the review's own, which the script tells for
 * Chinese, Japanese and Korean (both Chinese forms get Simplified by OpenCC). Latin letters may
 * be French as well as English, so English is asked for too and dropped if it was English.
 */
export function modelTargets(lang: string): ModelLocale[] {
  const own = lang === 'zh-Hans' || lang === 'zh-Hant' ? 'zh-Hans' : lang === 'ja' || lang === 'ko' ? lang : null
  return modelLocales.filter((locale) => locale !== own)
}

/** Whether a BCP 47 tag names this language; zh-TW and zh-Hant are not Simplified Chinese. */
function isLanguage(tag: string, locale: ModelLocale): boolean {
  const [primary = '', ...rest] = tag.trim().toLowerCase().split(/[-_]/)
  if (locale !== 'zh-Hans') return primary === locale
  return primary === 'zh' && !rest.some((part) => ['hant', 'tw', 'hk', 'mo'].includes(part))
}

const comparable = (text: string) => text.replace(/\s+/gu, ' ').trim()

/**
 * What is kept of the model's answer: a translation into each language asked for, except an
 * empty one, a copy of the review and one into the language the model says it is written in.
 */
export function keptTexts(body: string, targets: readonly ModelLocale[], output: Record<string, string>): TranslatedTexts {
  const language = output.language ?? ''
  const texts: TranslatedTexts = {}
  for (const target of targets) {
    const text = cleanText(output[target] ?? '')
    if (!text || comparable(text) === comparable(body) || isLanguage(language, target)) continue
    texts[target] = text
  }
  return texts
}

type TranslationRow = { source: string; status: TranslationStatus; texts: TranslatedTexts }

/** A row's texts while they still match the review: translated, from the text it has now. */
export function currentTexts(body: string, row: TranslationRow | null | undefined): TranslatedTexts | null {
  return row && row.status === 'done' && row.source === body ? row.texts : null
}

type Found = { text: string; convert: 'hant' | 'hans' | null }

function find(review: { body: string; lang: string }, locale: Locale, texts: TranslatedTexts | null): Found | null {
  if (locale === 'zh-Hant' && review.lang === 'zh-Hans') return { text: review.body, convert: 'hant' }
  if (locale === 'zh-Hans' && review.lang === 'zh-Hant') return { text: review.body, convert: 'hans' }
  if (locale === 'zh-Hant') return texts?.['zh-Hans'] ? { text: texts['zh-Hans'], convert: 'hant' } : null
  const text = texts?.[locale]
  return text ? { text, convert: null } : null
}

/** Whether a reader of `locale` can have this review translated; `texts` as from currentTexts. */
export function canTranslate(review: { body: string; lang: string }, locale: Locale, texts: TranslatedTexts | null): boolean {
  return find(review, locale, texts) !== null
}

/** The review in `locale` by machine, or null when there is none yet. */
export function translationText(review: { body: string; lang: string }, locale: Locale, texts: TranslatedTexts | null): string | null {
  const found = find(review, locale, texts)
  if (!found) return null
  return found.convert === 'hant' ? toHant(found.text) : found.convert === 'hans' ? toHans(found.text) : found.text
}

/** For GET /api/reviews/translation: a shown review, its app and its translation row. */
export async function reviewWithTranslation(payload: Payload, reviewId: number) {
  const [row] = await drizzleOf(payload)
    .select({
      appId: appReviews.appId,
      body: appReviews.body,
      lang: appReviews.lang,
      status: appReviews.status,
      source: appReviewTranslations.source,
      translation: appReviewTranslations.status,
      texts: appReviewTranslations.texts,
    })
    .from(appReviews)
    .leftJoin(appReviewTranslations, eq(appReviewTranslations.reviewId, appReviews.id))
    .where(eq(appReviews.id, reviewId))
    .limit(1)
  if (!row || row.status !== 'shown') return null
  const stored = row.source !== null && row.translation !== null ? { source: row.source, status: row.translation, texts: row.texts ?? {} } : null
  return { appId: row.appId, body: row.body, lang: row.lang, texts: currentTexts(row.body, stored) }
}

export type TranslationState = {
  source: string
  status: TranslationStatus
  texts: TranslatedTexts
  runsDay: string | null
  runs: number
}

export async function translationState(payload: Payload, reviewId: number): Promise<TranslationState | null> {
  const [row] = await drizzleOf(payload)
    .select({
      source: appReviewTranslations.source,
      status: appReviewTranslations.status,
      texts: appReviewTranslations.texts,
      runsDay: appReviewTranslations.runsDay,
      runs: appReviewTranslations.runs,
    })
    .from(appReviewTranslations)
    .where(eq(appReviewTranslations.reviewId, reviewId))
    .limit(1)
  return row ?? null
}

/** Paid runs left today for this review (`today` a Shanghai date). */
export function runsLeft(state: Pick<TranslationState, 'runsDay' | 'runs'> | null, today: string): number {
  const used = state?.runsDay === today ? state.runs : 0
  return Math.max(0, reviewRules.dailyTranslations - used)
}

/**
 * Stores what the job made of the review's text `source`, unless the author changed it meanwhile
 * (the job for the new text writes then). False when it was not stored.
 */
export async function storeTranslation(
  payload: Payload,
  reviewId: number,
  source: string,
  result:
    | { status: 'done'; texts: TranslatedTexts; language: string; model: string; runsDay: string; runs: number }
    | { status: 'failed'; error: string },
): Promise<boolean> {
  const db = drizzleOf(payload)
  const [current] = await db.select({ body: appReviews.body }).from(appReviews).where(eq(appReviews.id, reviewId)).limit(1)
  if (!current || current.body !== source) return false
  const now = new Date()
  const values =
    result.status === 'done'
      ? {
          source,
          status: result.status,
          texts: result.texts,
          language: result.language || null,
          model: result.model,
          error: null,
          runsDay: result.runsDay,
          runs: result.runs,
          updatedAt: now,
        }
      : // A failure keeps the day's count; the texts stay but no longer match.
        { source, status: result.status, error: result.error.slice(0, 2000), updatedAt: now }
  await db
    .insert(appReviewTranslations)
    .values({ reviewId, ...values })
    .onConflictDoUpdate({ target: appReviewTranslations.reviewId, set: values })
  return true
}

/**
 * Shown reviews of published apps without a translation of their current text, last changed
 * before `before`, for the sweep: never translated, changed since, or failed on an older text. One
 * that failed on its current text waits for「重新翻译」; one out of runs today waits for tomorrow.
 * Newest first. Reviews of an app taken down wait for it to come back, as the job would skip them.
 */
export async function untranslatedReviews(payload: Payload, before: Date, today: string, limit = 50): Promise<number[]> {
  const t = appReviewTranslations
  const rows = await drizzleOf(payload)
    .select({ id: appReviews.id })
    .from(appReviews)
    .leftJoin(t, eq(t.reviewId, appReviews.id))
    .where(
      and(
        eq(appReviews.status, 'shown'),
        sql`exists (select 1 from apps where apps.id = ${appReviews.appId} and apps.status = 'published')`,
        lt(appReviews.updatedAt, before),
        or(isNull(t.reviewId), ne(t.source, appReviews.body)),
        or(isNull(t.runsDay), ne(t.runsDay, today), lt(t.runs, reviewRules.dailyTranslations)),
      ),
    )
    .orderBy(desc(appReviews.id))
    .limit(limit)
  return rows.map((row) => row.id)
}
