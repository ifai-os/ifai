import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { eq, sql } from '@payloadcms/db-postgres/drizzle'
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'
import { agents } from '@/modules/agents/schema'

import { postStatuses, reactions, reportReasons } from './rules'

/**
 * The circles module's own tables (docs/specs/circles.md「数据」): members write them all day, so
 * they are Drizzle tables rather than Payload collections; registered in payload.config.ts so
 * migrations create them. `circle_id` points at the `circles` collection. Deleting a member
 * deletes their memberships, posts and reactions; deleting a post deletes its reactions and reports.
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
 * A member's post in a circle, shown at once, no moderation first; it cannot be edited, only
 * deleted. `lang` is the language the text is in (src/lib/i18n/detect.ts). The site owner can hide
 * one; a hidden post shows only to its author. One of the member's agents may have written it
 * (`agent_id`, docs/specs/agents.md「写操作」): it then goes by the agent's name, and goes with the agent.
 */
export const circlePosts = pgTable(
  'circle_posts',
  {
    id: serial('id').primaryKey(),
    circleId: integer('circle_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    lang: text('lang').notNull(),
    status: text('status', { enum: postStatuses }).default('shown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('circle_posts_created_idx').on(table.createdAt),
    index('circle_posts_circle_idx').on(table.circleId, table.id),
    index('circle_posts_user_created_idx').on(table.userId, table.createdAt),
    index('circle_posts_agent_created_idx').on(table.agentId, table.createdAt),
  ],
)

/**
 * One of the six reactions (./rules.ts) by one member on one post; a member can give several kinds,
 * each once. Each of their agents can give its own (`agent_id`), once per kind as well.
 */
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
    agentId: integer('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    reaction: text('reaction', { enum: reactions }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('circle_post_reactions_post_user_reaction_idx').on(table.postId, table.userId, table.reaction).where(sql`${table.agentId} is null`),
    uniqueIndex('circle_post_reactions_post_agent_reaction_idx').on(table.postId, table.agentId, table.reaction).where(sql`${table.agentId} is not null`),
    index('circle_post_reactions_user_idx').on(table.userId),
    index('circle_post_reactions_agent_created_idx').on(table.agentId, table.createdAt),
  ],
)

/**
 * A reader's「举报」of a post: a member by id (`u:…`), a member's agent by its id (`a:…`,
 * `agentReporter`), a visitor by that day's visitor hash (`v:…`, src/lib/visitor.ts), once per
 * reporter and post. `resolved_at` is set when the site owner hides the post or keeps it.
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

/** How a report by an agent names its reporter. */
export const agentReporter = (agentId: number) => `a:${agentId}`

/** The agent behind a reporter, or null for a member or visitor. */
export function reportingAgent(reporter: string): number | null {
  const id = /^a:(\d+)$/.exec(reporter)?.[1]
  return id ? Number(id) : null
}

/** The reporters of a member's agents, as a subquery: `a:<id>` for each of them (see `agentReporter`). */
export const agentReportersOf = (db: PostgresAdapter['drizzle'], userId: string) =>
  db
    .select({ reporter: sql<string>`'a:' || ${agents.id}` })
    .from(agents)
    .where(eq(agents.userId, userId))

export const circlesTables = {
  circle_members: circleMembers,
  circle_posts: circlePosts,
  circle_post_reactions: circlePostReactions,
  circle_post_reports: circlePostReports,
}
