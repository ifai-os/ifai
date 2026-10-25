import { index, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

/**
 * Members' public profiles and who follows whom (docs/specs/circles.md, step 4): the address
 * itself is `auth_users.handle`, which Better Auth keeps in the session. Registered in
 * payload.config.ts so migrations create them; everything here goes with the member's account.
 */

/**
 * What a member says about themselves on their page, besides their name: one line (`bio`, in the
 * language `bio_lang` it is written in) and a site of their own. The row comes with their first
 * save. `handle_changed_at` is the last time they changed their address themselves; null while
 * they still have the one IFAI gave them, which they can change at any time.
 */
export const memberProfiles = pgTable('member_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  bio: text('bio').default('').notNull(),
  bioLang: text('bio_lang'),
  website: text('website'),
  handleChangedAt: timestamp('handle_changed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

/** An address a member had before: it sends visitors on to their page and stays theirs, so nobody else can take it. */
export const memberOldHandles = pgTable(
  'member_old_handles',
  {
    handle: text('handle').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('member_old_handles_user_idx').on(table.userId)],
)

/** One member following another; unfollowing deletes the row. Public: profiles list both sides. */
export const memberFollows = pgTable(
  'member_follows',
  {
    id: serial('id').primaryKey(),
    followerId: text('follower_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('member_follows_follower_followee_idx').on(table.followerId, table.followeeId),
    index('member_follows_followee_idx').on(table.followeeId, table.id),
    index('member_follows_follower_created_idx').on(table.followerId, table.createdAt),
  ],
)

export const profilesTables = {
  member_profiles: memberProfiles,
  member_old_handles: memberOldHandles,
  member_follows: memberFollows,
}
