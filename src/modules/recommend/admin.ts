import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, asc, count, desc, eq, isNull, max } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { authUsers } from '@/lib/auth/schema'
import { cleanName } from '@/modules/apps/reviews/rules'

import { articleReports } from './schema'
import type { ReportReason } from './writing'

/**
 * What the back office reads and changes about readers' articles (docs/specs/recommend.md
 * 「后台」): who wrote one, the reports on it, and the reports nobody has looked at yet. Free of
 * the Payload config, so the collection (its hooks and ./endpoints) can import it.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

export type ArticleAuthor = { name: string; email: string } | null

/** The member who wrote an article, for its edit page; null once they are gone. */
export async function articleAuthor(payload: Payload, userId: string): Promise<ArticleAuthor> {
  const [row] = await drizzleOf(payload).select({ name: authUsers.name, email: authUsers.email }).from(authUsers).where(eq(authUsers.id, userId)).limit(1)
  return row ? { name: cleanName(row.name), email: row.email } : null
}

export type AdminArticleReport = { reason: ReportReason; reportedAt: string; open: boolean }

/** Every report on the article, open ones first, then newest first. */
export async function reportsOn(payload: Payload, articleId: number): Promise<AdminArticleReport[]> {
  const rows = await drizzleOf(payload)
    .select({ reason: articleReports.reason, createdAt: articleReports.createdAt, resolvedAt: articleReports.resolvedAt })
    .from(articleReports)
    .where(eq(articleReports.articleId, articleId))
    .orderBy(asc(articleReports.resolvedAt), desc(articleReports.createdAt))
  return rows.map((row) => ({ reason: row.reason, reportedAt: row.createdAt.toISOString(), open: row.resolvedAt === null }))
}

/** The site owner has dealt with the article (hidden it, or kept it): its open reports are closed. */
export async function resolveReports(payload: Payload, articleId: number, now = new Date()): Promise<void> {
  await drizzleOf(payload)
    .update(articleReports)
    .set({ resolvedAt: now })
    .where(and(eq(articleReports.articleId, articleId), isNull(articleReports.resolvedAt)))
}

/** Deleting an article deletes its reports. */
export async function deleteReports(payload: Payload, articleId: number): Promise<void> {
  await drizzleOf(payload).delete(articleReports).where(eq(articleReports.articleId, articleId))
}

export type OpenArticleReport = { articleId: number; title: string; reports: number }

/** Articles with reports nobody has dealt with, most recently reported first (at most `limit`), for the notice above the list. */
export async function openArticleReports(payload: Payload, limit = 10): Promise<{ total: number; items: OpenArticleReport[] }> {
  const rows = await drizzleOf(payload)
    .select({ articleId: articleReports.articleId, reports: count(), last: max(articleReports.createdAt) })
    .from(articleReports)
    .where(isNull(articleReports.resolvedAt))
    .groupBy(articleReports.articleId)
    .orderBy(desc(max(articleReports.createdAt)))
  if (rows.length === 0) return { total: 0, items: [] }
  const shown = rows.slice(0, limit)
  const { docs } = await payload.find({
    collection: 'articles',
    where: { id: { in: shown.map((row) => row.articleId) } },
    select: { title: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const titles = new Map(docs.map((doc) => [doc.id, doc.title]))
  return {
    total: rows.length,
    items: shown.map((row) => ({ articleId: row.articleId, title: titles.get(row.articleId) ?? `#${row.articleId}`, reports: Number(row.reports) })),
  }
}
