import { index, pgTable, serial, text, timestamp } from '@payloadcms/db-postgres/drizzle/pg-core'

/**
 * One row per press of「订阅」(docs/specs/daily-email.md rule 9): the visitor hash from
 * src/lib/visitor.ts and the time, to allow ten an hour per visitor. Kept for a day.
 */
export const subscribeAttempts = pgTable(
  'subscribe_attempts',
  {
    id: serial('id').primaryKey(),
    visitorHash: text('visitor_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('subscribe_attempts_visitor_idx').on(table.visitorHash, table.createdAt)],
)

export const dailyEmailTables = { subscribe_attempts: subscribeAttempts }
