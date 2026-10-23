import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, count, desc, eq, inArray, isNull, max, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'

import { appReviewReports, appReviews, appReviewTranslations } from '../schema'
import { cleanName, type ReportReason, type ReviewStatus, type TranslatedTexts } from './rules'
import { currentTexts } from './translations'

/**
 * What the back office reads and changes about reviews: every review of an app with its reports
 * and translations, hiding and showing them again, and the reports nobody has looked at yet. Free
 * of the Payload config, so the collection (through ./endpoints) can import it.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export type AdminReview = {
  id: number
  rating: number
  body: string
  lang: string
  status: ReviewStatus
  createdAt: string
  editedAt: string | null
  author: { name: string; email: string }
  reports: { open: number; total: number; reasons: Partial<Record<ReportReason, number>> }
  /**
   * Its machine translations: `waiting` until there are some for the text it has now (the job
   * runs a minute after writing; the sweep every 30 minutes), `failed` until「重新翻译」.
   */
  translation:
    | { state: 'done'; language: string | null; texts: TranslatedTexts }
    | { state: 'failed'; error: string | null }
    | { state: 'waiting' }
}

/** An app's reviews, shown and hidden, newest first, with how often and why each was reported. */
export async function adminReviews(payload: Payload, appId: number, limit = 200): Promise<AdminReview[]> {
  const db = drizzleOf(payload)
  const rows = await db
    .select({
      id: appReviews.id,
      rating: appReviews.rating,
      body: appReviews.body,
      lang: appReviews.lang,
      status: appReviews.status,
      createdAt: appReviews.createdAt,
      editedAt: appReviews.editedAt,
      name: authUsers.name,
      email: authUsers.email,
      translatedFrom: appReviewTranslations.source,
      translation: appReviewTranslations.status,
      language: appReviewTranslations.language,
      texts: appReviewTranslations.texts,
      translationError: appReviewTranslations.error,
    })
    .from(appReviews)
    .innerJoin(authUsers, eq(authUsers.id, appReviews.userId))
    .leftJoin(appReviewTranslations, eq(appReviewTranslations.reviewId, appReviews.id))
    .where(eq(appReviews.appId, appId))
    .orderBy(desc(appReviews.id))
    .limit(limit)
  if (rows.length === 0) return []

  const reports = await db
    .select({
      reviewId: appReviewReports.reviewId,
      reason: appReviewReports.reason,
      total: count(),
      open: sql<number>`count(*) filter (where ${appReviewReports.resolvedAt} is null)`.mapWith(Number),
    })
    .from(appReviewReports)
    .where(
      inArray(
        appReviewReports.reviewId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(appReviewReports.reviewId, appReviewReports.reason)

  return rows.map((row) => {
    const mine = reports.filter((report) => report.reviewId === row.id)
    const current = row.translatedFrom === row.body
    const texts = currentTexts(row.body, current && row.translation ? { source: row.body, status: row.translation, texts: row.texts ?? {} } : null)
    return {
      id: row.id,
      rating: row.rating,
      body: row.body,
      lang: row.lang,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      author: { name: cleanName(row.name), email: row.email },
      reports: {
        open: mine.reduce((sum, report) => sum + report.open, 0),
        total: mine.reduce((sum, report) => sum + Number(report.total), 0),
        reasons: Object.fromEntries(mine.map((report) => [report.reason, Number(report.total)])),
      },
      translation: texts
        ? { state: 'done' as const, language: row.language, texts }
        : current && row.translation === 'failed'
          ? { state: 'failed' as const, error: row.translationError }
          : { state: 'waiting' as const },
    }
  })
}

/** Whether the app has this review, before the back office asks for its translation again. */
export async function hasReview(payload: Payload, appId: number, reviewId: number): Promise<boolean> {
  const [review] = await drizzleOf(payload)
    .select({ id: appReviews.id })
    .from(appReviews)
    .where(and(eq(appReviews.id, reviewId), eq(appReviews.appId, appId)))
    .limit(1)
  return Boolean(review)
}

/** Marks a review's open reports as dealt with. */
async function resolveReports(payload: Payload, reviewId: number, now: Date): Promise<void> {
  await drizzleOf(payload)
    .update(appReviewReports)
    .set({ resolvedAt: now })
    .where(and(eq(appReviewReports.reviewId, reviewId), isNull(appReviewReports.resolvedAt)))
}

/**
 * Hides a review of the app, or shows it again; or, with `keep`, leaves it as it is and closes
 * its reports. Hiding closes them too. False when the app has no such review.
 */
export async function moderateReview(
  payload: Payload,
  appId: number,
  reviewId: number,
  change: { status: ReviewStatus } | { keep: true },
  now = new Date(),
): Promise<boolean> {
  const db = drizzleOf(payload)
  const where = and(eq(appReviews.id, reviewId), eq(appReviews.appId, appId))
  if ('status' in change) {
    const updated = await db.update(appReviews).set({ status: change.status }).where(where).returning({ id: appReviews.id })
    if (updated.length === 0) return false
    if (change.status === 'hidden') await resolveReports(payload, reviewId, now)
    return true
  }
  const [review] = await db.select({ id: appReviews.id }).from(appReviews).where(where).limit(1)
  if (!review) return false
  await resolveReports(payload, reviewId, now)
  return true
}

function excerpt(body: string, length = 60): string {
  const characters = [...body.replace(/\s+/gu, ' ')]
  return characters.length > length ? `${characters.slice(0, length).join('')}…` : characters.join('')
}

export type OpenReport = {
  reviewId: number
  appId: number
  appName: string
  /** The review's first words. */
  excerpt: string
  reports: number
  lastReportedAt: string
}

/** Shown reviews with reports nobody has dealt with, most recently reported first. */
export async function openReports(payload: Payload, limit = 10): Promise<{ total: number; items: OpenReport[] }> {
  const db = drizzleOf(payload)
  const open = and(isNull(appReviewReports.resolvedAt), eq(appReviews.status, 'shown'))
  const [rows, [total]] = await Promise.all([
    db
      .select({
        reviewId: appReviewReports.reviewId,
        appId: appReviews.appId,
        body: appReviews.body,
        reports: count(),
        lastReportedAt: max(appReviewReports.createdAt),
      })
      .from(appReviewReports)
      .innerJoin(appReviews, eq(appReviews.id, appReviewReports.reviewId))
      .where(open)
      .groupBy(appReviewReports.reviewId, appReviews.appId, appReviews.body)
      .orderBy(desc(max(appReviewReports.createdAt)))
      .limit(limit),
    db
      .select({ count: sql<number>`count(distinct ${appReviewReports.reviewId})`.mapWith(Number) })
      .from(appReviewReports)
      .innerJoin(appReviews, eq(appReviews.id, appReviewReports.reviewId))
      .where(open),
  ])
  if (rows.length === 0) return { total: 0, items: [] }

  const { docs } = await payload.find({
    collection: 'apps',
    where: { id: { in: [...new Set(rows.map((row) => row.appId))] } },
    select: { name: true },
    depth: 0,
    limit: rows.length,
    pagination: false,
  })
  const names = new Map(docs.map((doc) => [doc.id, doc.name]))
  return {
    total: total?.count ?? rows.length,
    items: rows.map((row) => ({
      reviewId: row.reviewId,
      appId: row.appId,
      appName: names.get(row.appId) ?? `#${row.appId}`,
      excerpt: excerpt(row.body),
      reports: Number(row.reports),
      lastReportedAt: (row.lastReportedAt ?? new Date(0)).toISOString(),
    })),
  }
}
