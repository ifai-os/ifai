import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, gte, lt, ne, sum } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { toneFor } from '@/components/cards/initial-tile'
import type { Locale } from '@/i18n/config'
import { authUsers } from '@/lib/auth/schema'
import { shanghaiDayStart } from '@/lib/shanghai-day'

import { appReviewReports, appReviews, appReviewTranslations } from '../schema'
import {
  cleanName,
  reviewRules,
  summarize,
  type OwnReview,
  type ReportReason,
  type ReviewsPage,
  type ReviewStatus,
  type ReviewSummary,
  type ReviewView,
  type TranslatedTexts,
  type TranslationStatus,
} from './rules'
import { canTranslate, currentTexts } from './translations'

/**
 * Reading and writing reviews for the pages (src/app/api/reviews). Works on the Payload instance
 * it is given and stays free of the Payload config, like the back office's ./admin.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** Readers can review an app they can see: a published one. */
export async function isReviewable(payload: Payload, appId: number): Promise<boolean> {
  const { totalDocs } = await payload.count({ collection: 'apps', where: { id: { equals: appId } }, overrideAccess: false })
  return totalDocs > 0
}

const columns = {
  id: appReviews.id,
  userId: appReviews.userId,
  rating: appReviews.rating,
  body: appReviews.body,
  lang: appReviews.lang,
  status: appReviews.status,
  createdAt: appReviews.createdAt,
  editedAt: appReviews.editedAt,
  name: authUsers.name,
  translatedFrom: appReviewTranslations.source,
  translation: appReviewTranslations.status,
  texts: appReviewTranslations.texts,
}

type Row = {
  id: number
  userId: string
  rating: number
  body: string
  lang: string
  status: ReviewStatus
  createdAt: Date
  editedAt: Date | null
  name: string
  translatedFrom: string | null
  translation: TranslationStatus | null
  texts: TranslatedTexts | null
}

/** A review for a page in `locale` (null: no translations asked for). */
function toView(row: Row, locale: Locale | null): ReviewView {
  const stored =
    row.translatedFrom !== null && row.translation !== null ? { source: row.translatedFrom, status: row.translation, texts: row.texts ?? {} } : null
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    lang: row.lang,
    author: { name: cleanName(row.name), tone: toneFor(row.userId) },
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    translatable: locale !== null && canTranslate(row, locale, currentTexts(row.body, stored)),
  }
}

/** How many reviews readers see and their average, which shows from `averageFrom` reviews on. */
export async function reviewSummary(payload: Payload, appId: number): Promise<ReviewSummary> {
  const [row] = await drizzleOf(payload)
    .select({ count: count(), stars: sum(appReviews.rating) })
    .from(appReviews)
    .where(and(eq(appReviews.appId, appId), eq(appReviews.status, 'shown')))
  return summarize(Number(row?.count ?? 0), Number(row?.stars ?? 0))
}

async function ownReview(payload: Payload, appId: number, userId: string, locale: Locale | null): Promise<OwnReview | null> {
  const [row] = await drizzleOf(payload)
    .select(columns)
    .from(appReviews)
    .innerJoin(authUsers, eq(authUsers.id, appReviews.userId))
    .leftJoin(appReviewTranslations, eq(appReviewTranslations.reviewId, appReviews.id))
    .where(and(eq(appReviews.appId, appId), eq(appReviews.userId, userId)))
    .limit(1)
  return row ? { ...toView(row, locale), hidden: row.status === 'hidden' } : null
}

/**
 * One page of an app's reviews for `userId` (null for a visitor): the summary, their own review
 * apart, and everyone else's shown reviews, newest first, older than `before` when given. With
 * the page's `locale`, each says whether it can be translated into it.
 */
export async function reviewsPage(
  payload: Payload,
  appId: number,
  userId: string | null,
  before: number | null,
  locale: Locale | null = null,
): Promise<Omit<ReviewsPage, 'signedIn'>> {
  const db = drizzleOf(payload)
  const [summary, mine, rows] = await Promise.all([
    reviewSummary(payload, appId),
    userId ? ownReview(payload, appId, userId, locale) : Promise.resolve(null),
    db
      .select(columns)
      .from(appReviews)
      .innerJoin(authUsers, eq(authUsers.id, appReviews.userId))
      .leftJoin(appReviewTranslations, eq(appReviewTranslations.reviewId, appReviews.id))
      .where(
        and(
          eq(appReviews.appId, appId),
          eq(appReviews.status, 'shown'),
          userId ? ne(appReviews.userId, userId) : undefined,
          before ? lt(appReviews.id, before) : undefined,
        ),
      )
      .orderBy(desc(appReviews.id))
      .limit(reviewRules.pageSize + 1),
  ])
  const page = rows.slice(0, reviewRules.pageSize)
  return {
    summary,
    mine,
    reviews: page.map((row) => toView(row, locale)),
    next: rows.length > reviewRules.pageSize ? page[page.length - 1].id : null,
  }
}

export type SaveReviewResult =
  | { status: 'created' | 'updated'; reviewId: number; textChanged: boolean }
  | { status: 'unchanged' }
  | { status: 'daily-limit' }

/**
 * Writes the member's review of the app, or changes the one they have. A new review counts toward
 * the daily limit (Shanghai day); changing one does not, and a hidden review stays hidden.
 * `textChanged` says whether it needs translating (again).
 */
export async function saveReview(
  payload: Payload,
  review: { appId: number; userId: string; rating: number; body: string; lang: string },
  now = new Date(),
): Promise<SaveReviewResult> {
  const db = drizzleOf(payload)
  const { appId, userId, rating, body, lang } = review
  const [existing] = await db
    .select({ id: appReviews.id, rating: appReviews.rating, body: appReviews.body })
    .from(appReviews)
    .where(and(eq(appReviews.appId, appId), eq(appReviews.userId, userId)))
    .limit(1)
  if (existing) {
    if (existing.rating === rating && existing.body === body) return { status: 'unchanged' }
    await db.update(appReviews).set({ rating, body, lang, editedAt: now }).where(eq(appReviews.id, existing.id))
    return { status: 'updated', reviewId: existing.id, textChanged: existing.body !== body }
  }
  const [today] = await db
    .select({ count: count() })
    .from(appReviews)
    .where(and(eq(appReviews.userId, userId), gte(appReviews.createdAt, shanghaiDayStart(now))))
  if (Number(today?.count ?? 0) >= reviewRules.dailyLimit) return { status: 'daily-limit' }
  const [created] = await db
    .insert(appReviews)
    .values({ appId, userId, rating, body, lang })
    .onConflictDoNothing()
    .returning({ id: appReviews.id })
  // Nothing returned: the same member's other request wrote it a moment ago.
  return created ? { status: 'created', reviewId: created.id, textChanged: true } : { status: 'unchanged' }
}

/** Deletes the member's review of the app, with the reports about it. */
export async function deleteReview(payload: Payload, appId: number, userId: string): Promise<void> {
  await drizzleOf(payload)
    .delete(appReviews)
    .where(and(eq(appReviews.appId, appId), eq(appReviews.userId, userId)))
}

export type ReportResult = 'reported' | 'not-found' | 'own-review'

/** Records a reader's report of a shown review on a published app, once per reporter. */
export async function reportReview(
  payload: Payload,
  report: { reviewId: number; reason: ReportReason; reporter: string; userId: string | null },
): Promise<ReportResult> {
  const db = drizzleOf(payload)
  const [review] = await db
    .select({ appId: appReviews.appId, userId: appReviews.userId, status: appReviews.status })
    .from(appReviews)
    .where(eq(appReviews.id, report.reviewId))
    .limit(1)
  if (!review || review.status !== 'shown' || !(await isReviewable(payload, review.appId))) return 'not-found'
  if (review.userId === report.userId) return 'own-review'
  await db
    .insert(appReviewReports)
    .values({ reviewId: report.reviewId, reporter: report.reporter, reason: report.reason })
    .onConflictDoNothing()
  return 'reported'
}
