import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { reportReasons } from './writing'

/**
 * A reader's「举报」of a member's article (docs/specs/recommend.md rule 17): a member by id
 * (`u:…`), a visitor by that day's visitor hash (`v:…`, src/lib/visitor.ts), once per reporter
 * and article. `article_id` points at the `articles` collection; deleting the article deletes
 * its reports (its hooks). `resolved_at` is set when the site owner hides the article or keeps it.
 * Registered in payload.config.ts so migrations create it.
 */
export const articleReports = pgTable(
  'article_reports',
  {
    id: serial('id').primaryKey(),
    articleId: integer('article_id').notNull(),
    reporter: text('reporter').notNull(),
    reason: text('reason', { enum: reportReasons }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('article_reports_article_reporter_idx').on(table.articleId, table.reporter),
    index('article_reports_resolved_idx').on(table.resolvedAt),
  ],
)

export const recommendTables = {
  article_reports: articleReports,
}
