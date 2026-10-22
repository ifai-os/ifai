import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from '@payloadcms/db-postgres/drizzle/pg-core'

import { EMBEDDING_DIMENSIONS } from '@/lib/ai/purposes'

import { storyCategories } from './categories'
import type { AnalysisFlag } from './judge/rules'
import type { Structure } from './prompts/structure'

/** fresh: recent enough for "today" and the queue. archived: kept for the record only. */
export const rawItemStatuses = ['fresh', 'archived'] as const
/** Whether the original article body has been fetched for judging and writing. */
export const contentStatuses = ['pending', 'fetched', 'failed', 'skipped'] as const

export type RawItemStatus = (typeof rawItemStatuses)[number]
export type ContentStatus = (typeof contentStatuses)[number]

/**
 * Every link a source produced (docs/specs/daily.md, `raw_items`). High-volume and written
 * by background jobs, so it is a Drizzle table rather than a Payload collection; registered
 * in payload.config.ts so migrations create it. `source_id` points at the `sources` collection.
 */
export const rawItems = pgTable(
  'raw_items',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    /** The source's own summary, or the article's excerpt once fetched. */
    summary: text('summary'),
    /** Plain text of the article body, for the models only; never shown on the site. */
    content: text('content'),
    /** Links inside the article body; how roundups point at the stories they mention. */
    links: jsonb('links').$type<string[]>(),
    language: text('language').default('en').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).defaultNow().notNull(),
    externalId: text('external_id'),
    discussionUrl: text('discussion_url'),
    signals: jsonb('signals').$type<{ points?: number; comments?: number }>(),
    status: text('status', { enum: rawItemStatuses }).default('fresh').notNull(),
    contentStatus: text('content_status', { enum: contentStatuses }).default('pending').notNull(),
    contentError: text('content_error'),
    contentFetchedAt: timestamp('content_fetched_at', { withTimezone: true }),
    /** Filled in by the judging step (pgvector); size follows the default embedding model. */
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (table) => [
    uniqueIndex('raw_items_url_idx').on(table.url),
    index('raw_items_source_discovered_idx').on(table.sourceId, table.discoveredAt),
    index('raw_items_status_discovered_idx').on(table.status, table.discoveredAt),
    index('raw_items_published_at_idx').on(table.publishedAt),
    index('raw_items_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
)

/**
 * One happening, grouped from one or more reports (docs/specs/daily.md「流程」6). The
 * representative report is the first one that created the event; the writing step reads
 * every member. `heat` is filled in by the heat step (6).
 */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    representativeItemId: integer('representative_item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    /** The representative report's title, for the back office; stories carry the written titles. */
    title: text('title').notNull(),
    category: text('category', { enum: storyCategories }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    heat: real('heat').default(0).notNull(),
    heatUpdatedAt: timestamp('heat_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('events_last_seen_idx').on(table.lastSeenAt)],
)

/** How a report relates to its event: the same happening, a later development, or a digest that mentions it. */
export const eventRelations = ['same', 'follow_up', 'roundup'] as const
export type EventRelation = (typeof eventRelations)[number]

export const eventItems = pgTable(
  'event_items',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    relation: text('relation', { enum: eventRelations }).notNull(),
    /** For "same": this report has details the representative lacks. */
    newInformation: boolean('new_information').default(false).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A roundup attaches to every event it mentions; a report attaches to one event (enforced in code).
    uniqueIndex('event_items_event_item_idx').on(table.eventId, table.itemId),
    index('event_items_item_idx').on(table.itemId),
  ],
)

/** How far judging got; each stage's result stays on the row so a retry picks up where it stopped. */
export const analysisStages = ['pending', 'prefiltered', 'scored', 'structured', 'embedded', 'grouped'] as const
export type AnalysisStage = (typeof analysisStages)[number]

/**
 * Where the item ended up. `queued`: a candidate story for writing and review. `merged`: the
 * same happening as an earlier report, counted as another source. `roundup`: a digest, only
 * linked to the events it mentions. `blocked`: a model call failed repeatedly and needs a person.
 */
export const analysisOutcomes = [
  'pending',
  'queued',
  'merged',
  'irrelevant',
  'low_score',
  'insufficient',
  'roundup',
  'blocked',
] as const
export type AnalysisOutcome = (typeof analysisOutcomes)[number]

export const promptNames = ['prefilter', 'score', 'structure', 'group'] as const

/** The judging steps' results for one report (docs/specs/daily.md, `item_analyses`). */
export const itemAnalyses = pgTable(
  'item_analyses',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => rawItems.id, { onDelete: 'cascade' }),
    stage: text('stage', { enum: analysisStages }).default('pending').notNull(),
    outcome: text('outcome', { enum: analysisOutcomes }).default('pending').notNull(),
    outcomeReason: text('outcome_reason'),
    promptVersions: jsonb('prompt_versions').$type<Partial<Record<(typeof promptNames)[number], string>>>(),
    relevant: boolean('relevant'),
    relevanceReason: text('relevance_reason'),
    scoreA: integer('score_a'),
    scoreB: integer('score_b'),
    scoreAverage: real('score_average'),
    scoreThreshold: integer('score_threshold'),
    scoreReasons: jsonb('score_reasons').$type<string[]>(),
    structure: jsonb('structure').$type<Structure>(),
    eventId: integer('event_id').references(() => events.id, { onDelete: 'set null' }),
    relation: text('relation', { enum: eventRelations }),
    flags: jsonb('flags').$type<AnalysisFlag[]>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('item_analyses_item_idx').on(table.itemId),
    index('item_analyses_outcome_idx').on(table.outcome, table.updatedAt),
    index('item_analyses_event_idx').on(table.eventId),
  ],
)

export const dailyTables = { raw_items: rawItems, events, event_items: eventItems, item_analyses: itemAnalyses }
