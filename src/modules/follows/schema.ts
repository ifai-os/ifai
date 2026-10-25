import { index, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { followTypes } from './target'

/**
 * Follows (docs/specs/daily.md「关注」): one row per member and thing they follow; unfollowing
 * deletes the row, so the rows for a target are the members who follow it now. `target_key` is a
 * daily industry tag for 'tag' and a topic key (the compared name of a company or product) for
 * 'topic'. Rows go with the member's account.
 */
export const follows = pgTable(
  'follows',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: followTypes }).notNull(),
    targetKey: text('target_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('follows_user_target_idx').on(table.userId, table.targetType, table.targetKey),
    index('follows_target_idx').on(table.targetType, table.targetKey),
  ],
)

export const followsTables = { follows }
