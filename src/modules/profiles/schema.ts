import { index, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { memberReportReasons } from './rules'

/**
 * Members' public profiles, who follows and who blocks whom, and reports of members
 * (docs/specs/circles.md, step 4): the address itself is `auth_users.handle`, which Better Auth
 * keeps in the session. Registered in payload.config.ts so migrations create them; everything
 * here goes with the member's account.
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

/**
 * An address a member had before: it sends visitors on to their page and stays theirs, so nobody
 * else can take it. One the site owner took away (`retired_at`, rule 24) leads nowhere, and
 * nobody can have it again, its member included.
 */
export const memberOldHandles = pgTable(
  'member_old_handles',
  {
    handle: text('handle').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
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

/**
 * One member blocking another (rule 23): neither sees the other's posts and comments, and neither
 * can follow, react to or comment on the other. Unblocking deletes the row. Private: only the
 * member who blocked sees it, in their settings.
 */
export const memberBlocks = pgTable(
  'member_blocks',
  {
    id: serial('id').primaryKey(),
    blockerId: text('blocker_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('member_blocks_blocker_blocked_idx').on(table.blockerId, table.blockedId),
    index('member_blocks_blocked_idx').on(table.blockedId),
  ],
)

/**
 * A reader's report of a member (rule 24). `reporter` is `u:<member id>` or the day's visitor
 * hash `v:…`, as on reports of posts; the site owner dealing with the member sets `resolved_at`.
 */
export const memberReports = pgTable(
  'member_reports',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    reporter: text('reporter').notNull(),
    reason: text('reason', { enum: memberReportReasons }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('member_reports_user_reporter_idx').on(table.userId, table.reporter),
    index('member_reports_resolved_idx').on(table.resolvedAt),
  ],
)

export const profilesTables = {
  member_profiles: memberProfiles,
  member_old_handles: memberOldHandles,
  member_follows: memberFollows,
  member_blocks: memberBlocks,
  member_reports: memberReports,
}
