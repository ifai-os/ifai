import {
  date,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from '@payloadcms/db-postgres/drizzle/pg-core'

/**
 * The apps module's own tables (docs/specs/apps.md「数据」「热度」). Written by the visit route
 * and the daily heat job, so they are Drizzle tables rather than Payload collections;
 * registered in payload.config.ts so migrations create them. `app_id` points at the `apps`
 * collection, `story_id` at `stories`.
 */

/**
 * One row per visitor, app and Shanghai day that someone opened the app's website from its
 * page (the「打开网站」button, through /[locale]/apps/[slug]/visit). visitor_hash is a hash of
 * IP + user agent with a salt that changes every day; raw IPs are never stored. Bots and
 * prefetches are not recorded.
 */
export const appClicks = pgTable(
  'app_clicks',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull(),
    day: date('day').notNull(),
    visitorHash: text('visitor_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('app_clicks_app_day_visitor_idx').on(table.appId, table.day, table.visitorHash),
    index('app_clicks_day_idx').on(table.day),
  ],
)

export const mentionBases = ['name', 'alias', 'domain'] as const
export type MentionBasis = (typeof mentionBases)[number]

/**
 * A published daily story that is about an app: one of the products or companies the daily
 * pipeline extracted matches the app's name or an alias, or one of the story's sources is on
 * the app's website. `removed_at` is set when the site owner says the match is wrong; the row
 * stays so the next run does not add it back.
 */
export const appMentions = pgTable(
  'app_mentions',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull(),
    storyId: integer('story_id').notNull(),
    eventId: integer('event_id'),
    basis: text('basis', { enum: mentionBases }).notNull(),
    /** What matched: the product or company as the story's analysis named it, or the source's address. */
    matched: text('matched').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('app_mentions_app_story_idx').on(table.appId, table.storyId),
    index('app_mentions_app_published_idx').on(table.appId, table.publishedAt),
    index('app_mentions_published_idx').on(table.publishedAt),
  ],
)

/**
 * One row per published app per Shanghai day, written by the heat job at 06:00 (see
 * ../heat.ts for how the parts are scored). The three scores add up to `heat`.
 */
export const appMetricsDaily = pgTable(
  'app_metrics_daily',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull(),
    day: date('day').notNull(),
    /** The app's primary category that day, for category ranks. */
    categoryId: integer('category_id'),
    /** Tranco rank of the app's registered domain; null when it is not in the list or the domain is not the app's own. */
    trancoRank: integer('tranco_rank'),
    /** The registered domain the rank is for (chat.deepseek.com → deepseek.com). */
    trancoDomain: text('tranco_domain'),
    /** The Tranco list the rank came from (kept from the day before when the download failed). */
    trancoListId: text('tranco_list_id'),
    /** Visitor-days that opened the website from IFAI in the 7 days before `day`. */
    clicks: integer('clicks').default(0).notNull(),
    /** New saves in the same 7 days (saves arrive with step 5; 0 until then). */
    saves: integer('saves').default(0).notNull(),
    /** Published daily stories about the app in the 30 days before `day`, one per event. */
    mentions: integer('mentions').default(0).notNull(),
    rankScore: smallint('rank_score').notNull(),
    engagementScore: smallint('engagement_score').notNull(),
    mentionScore: smallint('mention_score').notNull(),
    heat: smallint('heat').notNull(),
    /** heat minus the heat 7 days earlier; null when the app has no row from then. */
    change7d: smallint('change_7d'),
    rankOverall: integer('rank_overall').notNull(),
    rankCategory: integer('rank_category'),
    /** Place on the rising board; null when the app is not on it. */
    rankRising: integer('rank_rising'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('app_metrics_daily_app_day_idx').on(table.appId, table.day),
    index('app_metrics_daily_day_idx').on(table.day),
  ],
)

export const heatRunStatuses = ['running', 'done', 'failed'] as const
export type HeatRunStatus = (typeof heatRunStatuses)[number]

/** fresh: today's list was downloaded. reused: the download failed and the last known ranks were kept. */
export const trancoStatuses = ['fresh', 'reused'] as const
export type TrancoStatus = (typeof trancoStatuses)[number]

/** One row per day the heat job ran: what the back office shows about the last run. */
export const appHeatRuns = pgTable('app_heat_runs', {
  day: date('day').primaryKey(),
  status: text('status', { enum: heatRunStatuses }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  trancoStatus: text('tranco_status', { enum: trancoStatuses }),
  trancoListId: text('tranco_list_id'),
  /** Why the Tranco download failed, when it did. */
  trancoError: text('tranco_error'),
  apps: integer('apps'),
  mentions: integer('mentions'),
  error: text('error'),
})

export const appsTables = {
  app_clicks: appClicks,
  app_mentions: appMentions,
  app_metrics_daily: appMetricsDaily,
  app_heat_runs: appHeatRuns,
}
