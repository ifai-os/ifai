import { date, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

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

/** sending → sent → delivered, then bounced or complained; failed when Resend refused or it never went out. */
export const emailSendStatuses = ['sending', 'sent', 'delivered', 'bounced', 'complained', 'failed'] as const
export type EmailSendStatus = (typeof emailSendStatuses)[number]

/**
 * The morning emails (docs/specs/daily-email.md「数据」): one row per subscriber and local date,
 * written before the email goes out, so the unique index keeps it to one a day however often
 * the job runs. A failed row is tried again by a later run while it is still before 11:00
 * there, three tries at most.
 */
export const emailSends = pgTable(
  'email_sends',
  {
    id: serial('id').primaryKey(),
    /** The subscriber; null once an unsubscribed subscription is deleted (rule 10), so the numbers stay. */
    subscriberId: integer('subscriber_id'),
    /** The subscriber's own calendar date the email is for. */
    localDate: date('local_date').notNull(),
    /** The language it was written in, fixed when the row is claimed. */
    locale: text('locale').notNull(),
    status: text('status', { enum: emailSendStatuses }).notNull(),
    storyCount: integer('story_count'),
    resendId: text('resend_id'),
    error: text('error'),
    attempts: integer('attempts').default(1).notNull(),
    /** The Inngest run that claimed it: a retry of that run sends it again, other runs leave it alone. */
    runId: text('run_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('email_sends_subscriber_date_idx').on(table.subscriberId, table.localDate),
    index('email_sends_resend_idx').on(table.resendId),
    index('email_sends_run_idx').on(table.runId),
    index('email_sends_created_idx').on(table.createdAt),
  ],
)

/** Resend webhook deliveries already handled, by their svix-id: Resend may deliver one more than once. Kept a week. */
export const emailEvents = pgTable(
  'email_events',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('email_events_received_idx').on(table.receivedAt)],
)

/**
 * What Resend last told us, one row (id 1): the quota headers of the latest send (the free
 * plan's daily count resets at 00:00 UTC) and the latest refusal, for the subscriber list.
 */
export const resendState = pgTable('resend_state', {
  id: integer('id').primaryKey(),
  /** x-resend-daily-quota: emails sent today (UTC) on the free plan; absent on paid plans. */
  dailyUsed: integer('daily_used'),
  /** x-resend-monthly-quota */
  monthlyUsed: integer('monthly_used'),
  readAt: timestamp('read_at', { withTimezone: true }),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
})

export const dailyEmailTables = {
  subscribe_attempts: subscribeAttempts,
  email_sends: emailSends,
  email_events: emailEvents,
  resend_state: resendState,
}
