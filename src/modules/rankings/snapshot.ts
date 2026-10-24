import { and, eq, isNull, lt, sql } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { rankScores, RATING_METHOD, rateModels, seedOf, snapshotChecksum, type Duel } from './rating'
import { isOutcome, STALE_BATTLE_MS } from './rules'
import { arenaBattles, arenaSnapshotRows, arenaSnapshots } from './schema'

/**
 * The weekly snapshot (docs/specs/rankings.md rules 8 and 9): one arena's scores from all its
 * counted votes, stored for the week; the rankings page only reads snapshots. Computing the same
 * week again replaces it.
 */

/** Questions opened but never voted on, older than two days: they are no one's vote. */
export async function deleteUnvotedBattles(now: Date = new Date()): Promise<number> {
  const { db } = await getDb()
  const deleted = await db
    .delete(arenaBattles)
    .where(and(isNull(arenaBattles.votedAt), lt(arenaBattles.createdAt, new Date(now.getTime() - STALE_BATTLE_MS))))
    .returning({ id: arenaBattles.id })
  return deleted.length
}

/** The published arenas, in their order. */
export async function publishedArenaIds(): Promise<number[]> {
  const { payload } = await getDb()
  const { docs } = await payload.find({
    collection: 'arenas',
    where: { status: { equals: 'published' } },
    sort: 'order',
    pagination: false,
    depth: 0,
    select: { status: true },
  })
  return docs.map((arena) => Number(arena.id))
}

export type SnapshotResult =
  | { arenaId: number; week: string; status: 'stored'; votes: number; models: number; ranked: number }
  | { arenaId: number; week: string; status: 'skipped'; votes: number; reason: string }

/**
 * Scores every competing model of the arena from all its counted votes (votes with models since
 * retired or moved still inform the others' scores), places those with enough votes, adds each
 * model's average answer cost, and stores it as the week's snapshot. An arena where no model has
 * enough votes yet gets none: the page keeps its empty state until the first real ranking.
 */
export async function storeSnapshot(
  arenaId: number,
  week: string,
  /** Only votes cast before this; scripts/seed-rankings.ts builds past weeks with it. */
  { votedBefore }: { votedBefore?: Date } = {},
): Promise<SnapshotResult> {
  const { payload, db } = await getDb()
  const counted = and(
    eq(arenaBattles.arenaId, arenaId),
    eq(arenaBattles.counted, true),
    votedBefore ? lt(arenaBattles.votedAt, votedBefore) : undefined,
  )
  const [votes, { docs: competing }, costs] = await Promise.all([
    db.select({ a: arenaBattles.modelAId, b: arenaBattles.modelBId, outcome: arenaBattles.outcome }).from(arenaBattles).where(counted),
    payload.find({
      collection: 'arena-models',
      where: { and: [{ status: { equals: 'active' } }, { arenas: { equals: arenaId } }] },
      pagination: false,
      depth: 0,
      select: { status: true },
    }),
    db.execute<{ model_id: number; cost: number }>(sql`
      select model_id, avg(cost_usd)::float as cost from arena_answers
      where arena_id = ${arenaId} and status = 'done' and cost_usd > 0
      group by model_id`),
  ])
  const duels: Duel[] = votes.flatMap((vote) => (isOutcome(vote.outcome) ? [{ a: vote.a, b: vote.b, outcome: vote.outcome }] : []))
  const shown = new Set(competing.map((model) => Number(model.id)))
  const rows = rankScores(rateModels(duels, { seed: seedOf(`${arenaId}:${week}`) }).filter((score) => shown.has(score.modelId)))
  if (!rows.some((row) => row.rank !== null)) {
    return { arenaId, week, status: 'skipped', votes: duels.length, reason: 'no competing model has enough counted votes yet' }
  }

  const costByModel = new Map(costs.rows.map((row) => [Number(row.model_id), Number(row.cost)]))
  const checksum = snapshotChecksum({ method: RATING_METHOD, votes: duels.length, rows })
  await db.transaction(async (tx) => {
    await tx.delete(arenaSnapshots).where(and(eq(arenaSnapshots.arenaId, arenaId), eq(arenaSnapshots.week, week)))
    const [snapshot] = await tx
      .insert(arenaSnapshots)
      .values({ arenaId, week, votes: duels.length, method: RATING_METHOD, checksum, computedAt: votedBefore ?? new Date() })
      .returning({ id: arenaSnapshots.id })
    await tx.insert(arenaSnapshotRows).values(
      rows.map((row) => ({
        snapshotId: snapshot.id,
        modelId: row.modelId,
        rank: row.rank,
        provisional: row.provisional,
        score: row.score,
        lower: row.lower,
        upper: row.upper,
        votes: row.votes,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        costUsd: costByModel.get(row.modelId) ?? null,
      })),
    )
  })
  return { arenaId, week, status: 'stored', votes: duels.length, models: rows.length, ranked: rows.filter((row) => row.rank !== null).length }
}
