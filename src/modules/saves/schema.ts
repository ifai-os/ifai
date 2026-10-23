import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { saveTypes } from './target'

/**
 * Saves for every module (docs/specs/apps.md「数据」): one table, the types are in ./target.ts.
 * One row per member and thing they saved; unsaving deletes the row. So the rows for a target
 * are the members who have it saved now, and the rows created in a window are its new saves
 * (what the apps heat counts). `target_id` is the Payload id in the type's collection (`apps`
 * for 'app', `skills` for 'skill'). Rows go with the member's account.
 */
export const saves = pgTable(
  'saves',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: saveTypes }).notNull(),
    targetId: integer('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('saves_user_target_idx').on(table.userId, table.targetType, table.targetId),
    index('saves_target_idx').on(table.targetType, table.targetId),
    index('saves_type_created_idx').on(table.targetType, table.createdAt),
  ],
)

export const savesTables = { saves }
