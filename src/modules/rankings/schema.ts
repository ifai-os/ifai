import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from '@payloadcms/db-postgres/drizzle/pg-core'

import { authUsers } from '@/lib/auth/schema'

import { outcomes } from './rules'

/**
 * The model arena's own tables (docs/specs/rankings.md「数据」): written by readers' votes and the
 * weekly job, so they are Drizzle tables rather than Payload collections; registered in
 * payload.config.ts so migrations create them. `arena_id` points at `arenas`, `prompt_id` at
 * `arena_prompts`, `model_*` at `arena_models`, `answer_*` at `arena_answers`.
 */

/**
 * One question shown to a member: two answers in random order (A and B), and later their vote.
 * The id is random, so a vote can only name a question the member was actually shown. When the
 * member's account is deleted the vote stays without them (`user_id` set null), so the rankings
 * do not change; questions nobody voted on are deleted after two days.
 */
export const arenaBattles = pgTable(
  'arena_battles',
  {
    id: text('id').primaryKey(),
    arenaId: integer('arena_id').notNull(),
    promptId: integer('prompt_id').notNull(),
    modelAId: integer('model_a_id').notNull(),
    modelBId: integer('model_b_id').notNull(),
    answerAId: integer('answer_a_id').notNull(),
    answerBId: integer('answer_b_id').notNull(),
    userId: text('user_id').references(() => authUsers.id, { onDelete: 'set null' }),
    /** The page language the question was shown in. */
    pageLocale: text('page_locale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    votedAt: timestamp('voted_at', { withTimezone: true }),
    outcome: text('outcome', { enum: outcomes }),
    /** False until voted, and for votes cast too fast to have read the answers. */
    counted: boolean('counted').default(false).notNull(),
  },
  (table) => [
    index('arena_battles_arena_counted_idx').on(table.arenaId, table.counted),
    index('arena_battles_user_created_idx').on(table.userId, table.createdAt),
    index('arena_battles_created_idx').on(table.createdAt),
  ],
)

/** One arena's rankings for one week (the Monday it belongs to), as the weekly job computed them. */
export const arenaSnapshots = pgTable(
  'arena_snapshots',
  {
    id: serial('id').primaryKey(),
    arenaId: integer('arena_id').notNull(),
    week: date('week').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
    /** Counted votes the scores came from. */
    votes: integer('votes').notNull(),
    method: text('method').notNull(),
    /** Fingerprint of the rows (src/modules/rankings/rating.ts `snapshotChecksum`). */
    checksum: text('checksum').notNull(),
  },
  (table) => [uniqueIndex('arena_snapshots_arena_week_idx').on(table.arenaId, table.week)],
)

/** A model's line in a snapshot. Rank is null while the model is provisional. */
export const arenaSnapshotRows = pgTable(
  'arena_snapshot_rows',
  {
    id: serial('id').primaryKey(),
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => arenaSnapshots.id, { onDelete: 'cascade' }),
    modelId: integer('model_id').notNull(),
    rank: integer('rank'),
    provisional: boolean('provisional').notNull(),
    score: doublePrecision('score').notNull(),
    lower: doublePrecision('lower').notNull(),
    upper: doublePrecision('upper').notNull(),
    votes: integer('votes').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    ties: integer('ties').notNull(),
    /** Average cost of the model's answers in this arena, in US dollars; null without cost data. */
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }),
  },
  (table) => [index('arena_snapshot_rows_snapshot_idx').on(table.snapshotId), index('arena_snapshot_rows_model_idx').on(table.modelId)],
)

export const rankingsTables = {
  arena_battles: arenaBattles,
  arena_snapshots: arenaSnapshots,
  arena_snapshot_rows: arenaSnapshotRows,
}
