import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { reportReasons, reviewStatuses, translationStatuses, type TranslatedTexts } from './reviews/rules'

/**
 * The apps module's own tables (docs/specs/apps.md「数据」「热度」). Written by the visit route,
 * the daily heat job and readers' reviews, so they are Drizzle tables rather than Payload
 * collections; registered in payload.config.ts so migrations create them. `app_id` points at
 * the `apps` collection, `story_id` at `stories`.
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
    /** New saves in the same 7 days that are still saved (src/modules/saves). */
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

/**
 * A member's review of an app (docs/specs/apps.md「评价」): stars and their own words, shown at
 * once, no moderation first. One per member and app; editing changes it in place and sets
 * `edited_at`. `lang` is the language the text is in (src/lib/i18n/detect.ts). The site owner can
 * hide one; a hidden review shows only to its author. Deleting the member deletes their reviews.
 */
export const appReviews = pgTable(
  'app_reviews',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** 1–5 stars. */
    rating: smallint('rating').notNull(),
    body: text('body').notNull(),
    lang: text('lang').notNull(),
    status: text('status', { enum: reviewStatuses }).default('shown').notNull(),
    /** When the author last changed the stars or the text. */
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('app_reviews_app_user_idx').on(table.appId, table.userId),
    index('app_reviews_app_status_idx').on(table.appId, table.status, table.id),
    index('app_reviews_user_created_idx').on(table.userId, table.createdAt),
  ],
)

/**
 * A reader's「举报」of a review: a member by id (`u:…`), a visitor by that day's visitor hash
 * (`v:…`, src/lib/visitor.ts), once per reporter and review. `resolved_at` is set when the site
 * owner hides the review or keeps it.
 */
export const appReviewReports = pgTable(
  'app_review_reports',
  {
    id: serial('id').primaryKey(),
    reviewId: integer('review_id')
      .notNull()
      .references(() => appReviews.id, { onDelete: 'cascade' }),
    reporter: text('reporter').notNull(),
    reason: text('reason', { enum: reportReasons }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('app_review_reports_review_reporter_idx').on(table.reviewId, table.reporter),
    index('app_review_reports_resolved_idx').on(table.resolvedAt),
  ],
)

/**
 * A review's machine translations (docs/specs/apps.md 5c), one row per review. `source` is the
 * review's text they were made from: once the author changes it, the row no longer matches and
 * counts as missing until the job translates again. `texts` holds what the model wrote, never in
 * the review's own language; zh-Hant is converted from zh-Hans when read. `runs` counts the paid
 * runs on `runs_day` (a Shanghai date), at most `reviewRules.dailyTranslations`.
 */
export const appReviewTranslations = pgTable('app_review_translations', {
  reviewId: integer('review_id')
    .primaryKey()
    .references(() => appReviews.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  status: text('status', { enum: translationStatuses }).notNull(),
  /** The review's language as the model read it (BCP 47): fr for a review the page took for English. */
  language: text('language'),
  texts: jsonb('texts').$type<TranslatedTexts>().default({}).notNull(),
  model: text('model'),
  /** Why the last try failed, when it did. */
  error: text('error'),
  runsDay: date('runs_day'),
  runs: smallint('runs').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const appsTables = {
  app_clicks: appClicks,
  app_mentions: appMentions,
  app_metrics_daily: appMetricsDaily,
  app_heat_runs: appHeatRuns,
  app_reviews: appReviews,
  app_review_reports: appReviewReports,
  app_review_translations: appReviewTranslations,
}
