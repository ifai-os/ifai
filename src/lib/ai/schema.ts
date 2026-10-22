import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from '@payloadcms/db-postgres/drizzle/pg-core'

/**
 * One receipt per paid model call (docs/specs/daily.md, `model_receipts`). A receipt is
 * written before the call and keyed by purpose + input hash, so a retried or restarted job
 * reuses the stored output instead of paying again. Registered in payload.config.ts so
 * Payload migrations create it.
 */
export const modelReceipts = pgTable(
  'model_receipts',
  {
    id: serial('id').primaryKey(),
    purpose: text('purpose').notNull(),
    inputHash: text('input_hash').notNull(),
    model: text('model').notNull(),
    /** Optional pointer to what the call was about, e.g. "raw_items:123". */
    subject: text('subject'),
    /** pending → succeeded | failed */
    status: text('status', { enum: ['pending', 'succeeded', 'failed'] }).notNull(),
    attempts: integer('attempts').default(1).notNull(),
    output: jsonb('output'),
    error: text('error'),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('model_receipts_purpose_input_hash_idx').on(table.purpose, table.inputHash),
    index('model_receipts_completed_at_idx').on(table.completedAt),
  ],
)

export const aiTables = { model_receipts: modelReceipts }
