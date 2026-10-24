import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { postStatuses, reactions, reportReasons, videoProviders } from './rules'

/**
 * The circles module's own tables (docs/specs/circles.md「数据」): members write them all day, so
 * they are Drizzle tables rather than Payload collections; registered in payload.config.ts so
 * migrations create them. `circle_id` points at the `circles` collection. Deleting a member
 * deletes their memberships, posts and reactions; deleting a post deletes its reactions and reports.
 * Pictures are the `circle-images` upload collection (./collections/CircleImages.ts).
 */

/** A member who joined a circle: its「我的圈子」and the count on its card. */
export const circleMembers = pgTable(
  'circle_members',
  {
    id: serial('id').primaryKey(),
    circleId: integer('circle_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('circle_members_circle_user_idx').on(table.circleId, table.userId),
    index('circle_members_user_idx').on(table.userId),
  ],
)

/**
 * A video link (docs/specs/circles.md rule 13), read once from its site and shared by every post
 * that links it: public facts, nobody's personal data. `cover_id` is the cover in `circle-images`.
 * `found` is false when nothing could be read (gone, private, or the site did not answer); such a
 * card is a plain link, and the next post with the link tries again after an hour. A row pasted
 * over a week ago that no post uses any more is deleted (./media/cleanup.ts).
 */
export const circleVideos = pgTable(
  'circle_videos',
  {
    id: serial('id').primaryKey(),
    provider: text('provider', { enum: videoProviders }).notNull(),
    /** The video's id on its site (./media/links.ts). */
    videoKey: text('video_key').notNull(),
    url: text('url').notNull(),
    title: text('title'),
    channel: text('channel'),
    durationSeconds: integer('duration_seconds'),
    coverId: integer('cover_id'),
    found: boolean('found').default(false).notNull(),
    /** Who first pasted it, for the daily limit. */
    requestedBy: text('requested_by').references(() => authUsers.id, { onDelete: 'set null' }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('circle_videos_provider_key_idx').on(table.provider, table.videoKey),
    index('circle_videos_requested_idx').on(table.requestedBy, table.createdAt),
  ],
)

/**
 * A member's post in a circle, shown at once, no moderation first; it cannot be edited, only
 * deleted. `lang` is the language the text is in (src/lib/i18n/detect.ts); the text can be empty
 * when the post has pictures or a video. The site owner can hide one; a hidden post shows only to
 * its author.
 */
export const circlePosts = pgTable(
  'circle_posts',
  {
    id: serial('id').primaryKey(),
    circleId: integer('circle_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    lang: text('lang').notNull(),
    status: text('status', { enum: postStatuses }).default('shown').notNull(),
    videoId: integer('video_id').references(() => circleVideos.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('circle_posts_created_idx').on(table.createdAt),
    index('circle_posts_circle_idx').on(table.circleId, table.id),
    index('circle_posts_user_created_idx').on(table.userId, table.createdAt),
    index('circle_posts_video_idx').on(table.videoId),
  ],
)

/** One of the six reactions (./rules.ts) by one member on one post; a member can give several kinds, each once. */
export const circlePostReactions = pgTable(
  'circle_post_reactions',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => circlePosts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    reaction: text('reaction', { enum: reactions }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('circle_post_reactions_post_user_reaction_idx').on(table.postId, table.userId, table.reaction),
    index('circle_post_reactions_user_idx').on(table.userId),
  ],
)

/**
 * A reader's「举报」of a post: a member by id (`u:…`), a visitor by that day's visitor hash
 * (`v:…`, src/lib/visitor.ts), once per reporter and post. `resolved_at` is set when the site
 * owner hides the post or keeps it.
 */
export const circlePostReports = pgTable(
  'circle_post_reports',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => circlePosts.id, { onDelete: 'cascade' }),
    reporter: text('reporter').notNull(),
    reason: text('reason', { enum: reportReasons }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('circle_post_reports_post_reporter_idx').on(table.postId, table.reporter),
    index('circle_post_reports_resolved_idx').on(table.resolvedAt),
  ],
)

export const circlesTables = {
  circle_videos: circleVideos,
  circle_members: circleMembers,
  circle_posts: circlePosts,
  circle_post_reactions: circlePostReactions,
  circle_post_reports: circlePostReports,
}
