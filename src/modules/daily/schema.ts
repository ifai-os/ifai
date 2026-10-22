import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from '@payloadcms/db-postgres/drizzle/pg-core'

import { EMBEDDING_DIMENSIONS } from '@/lib/ai/purposes'

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

export const dailyTables = { raw_items: rawItems }
