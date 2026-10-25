import { and, count, desc, eq, inArray, isNotNull, lt } from '@payloadcms/db-postgres/drizzle'

import type { Locale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { getDb } from '@/lib/db/drizzle'

import { rankingsCacheTag } from './cache'
import { TREND_WEEKS, type Region, type TrendPoint, type Weights } from './rules'
import { arenaBattles, arenaSnapshotRows, arenaSnapshots } from './schema'

/**
 * What the rankings pages read (docs/specs/rankings.md「页面与路由」): the published arenas and an
 * arena's latest weekly snapshot with its models, trend and newcomers. Only published arenas and
 * the models in a snapshot are read. Cached for an hour under `rankingsCacheTag`, which the weekly
 * job and the back office's saves refresh.
 */

const cacheOptions = { tags: [rankingsCacheTag], revalidate: 3600 }

export type PublicArena = { id: number; slug: string; name: string; intro: string | null }

/** The published arenas in their order, in the page's language (English where one is missing). */
export const getArenas = cached(
  async (locale: Locale): Promise<PublicArena[]> => {
    const { payload } = await getDb()
    const { docs } = await payload.find({
      collection: 'arenas',
      where: { status: { equals: 'published' } },
      sort: 'order',
      locale,
      pagination: false,
      depth: 0,
      select: { slug: true, name: true, intro: true },
    })
    return docs.map((arena) => ({ id: Number(arena.id), slug: arena.slug ?? String(arena.id), name: arena.name ?? '', intro: arena.intro || null }))
  },
  ['rankings-arenas'],
  cacheOptions,
)

export type BoardModel = {
  modelId: number
  name: string
  org: string
  weights: Weights
  region: Region
  license: string | null
  licenseUrl: string | null
}

export type BoardRow = BoardModel & {
  /** Null while provisional. */
  rank: number | null
  provisional: boolean
  score: number
  lower: number
  upper: number
  votes: number
  /** Average cost of an answer in this arena, US dollars; null without cost data. */
  costUsd: number | null
}

export type Newcomer = Pick<BoardRow, 'modelId' | 'name' | 'org' | 'rank'>

export type Board = {
  /** The Monday of the latest snapshot's week; null before the first. */
  week: string | null
  computedAt: string | null
  /** The latest snapshot: placed models by rank, then provisional ones. */
  rows: BoardRow[]
  /** The weeks up to the latest, oldest first: the best closed and best open-weights score of each. */
  trend: TrendPoint[]
  /** Placed for the first time in the latest week (never before in this arena), by rank. */
  newcomers: Newcomer[]
}

const emptyBoard: Board = { week: null, computedAt: null, rows: [], trend: [], newcomers: [] }

/** An arena's latest snapshot, its last 12 weeks and its newcomers, models in the page's language. */
export const getBoard = cached(
  async (arenaId: number, locale: Locale): Promise<Board> => {
    const { payload, db } = await getDb()
    const snapshots = await db
      .select({ id: arenaSnapshots.id, week: arenaSnapshots.week, computedAt: arenaSnapshots.computedAt })
      .from(arenaSnapshots)
      .where(eq(arenaSnapshots.arenaId, arenaId))
      .orderBy(desc(arenaSnapshots.week))
      .limit(TREND_WEEKS)
    const latest = snapshots[0]
    if (!latest) return emptyBoard

    const [rows, placedBefore] = await Promise.all([
      db
        .select({
          snapshotId: arenaSnapshotRows.snapshotId,
          modelId: arenaSnapshotRows.modelId,
          rank: arenaSnapshotRows.rank,
          provisional: arenaSnapshotRows.provisional,
          score: arenaSnapshotRows.score,
          lower: arenaSnapshotRows.lower,
          upper: arenaSnapshotRows.upper,
          votes: arenaSnapshotRows.votes,
          costUsd: arenaSnapshotRows.costUsd,
        })
        .from(arenaSnapshotRows)
        .where(inArray(arenaSnapshotRows.snapshotId, snapshots.map((snapshot) => snapshot.id))),
      db
        .selectDistinct({ modelId: arenaSnapshotRows.modelId })
        .from(arenaSnapshotRows)
        .innerJoin(arenaSnapshots, eq(arenaSnapshots.id, arenaSnapshotRows.snapshotId))
        .where(and(eq(arenaSnapshots.arenaId, arenaId), lt(arenaSnapshots.week, latest.week), isNotNull(arenaSnapshotRows.rank))),
    ])

    const { docs: models } = await payload.find({
      collection: 'arena-models',
      where: { id: { in: [...new Set(rows.map((row) => row.modelId))] } },
      locale,
      pagination: false,
      depth: 0,
      select: { name: true, org: true, weights: true, region: true, license: true, licenseUrl: true },
    })
    const modelById = new Map<number, BoardModel>(
      models.map((model) => [
        Number(model.id),
        {
          modelId: Number(model.id),
          name: model.name,
          org: model.org ?? '',
          weights: model.weights,
          region: model.region,
          license: model.license || null,
          licenseUrl: model.licenseUrl || null,
        },
      ]),
    )

    // A model deleted since keeps its place in the history but has nothing to show.
    const latestRows: BoardRow[] = rows
      .filter((row) => row.snapshotId === latest.id && modelById.has(row.modelId))
      .map(
        (row): BoardRow => ({
          ...(modelById.get(row.modelId) as BoardModel),
          rank: row.rank,
          provisional: row.provisional,
          score: row.score,
          lower: row.lower,
          upper: row.upper,
          votes: row.votes,
          costUsd: row.costUsd,
        }),
      )
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.modelId - b.modelId)

    const trend = [...snapshots].reverse().map((snapshot): TrendPoint => {
      const best = (weights: Weights) => {
        const scores = rows
          .filter((row) => row.snapshotId === snapshot.id && row.rank !== null && modelById.get(row.modelId)?.weights === weights)
          .map((row) => row.score)
        return scores.length ? Math.max(...scores) : null
      }
      return { week: snapshot.week, open: best('open'), closed: best('closed') }
    })

    // Every snapshot places someone, so an arena's first week has no newcomers: everyone is new.
    const before = new Set(placedBefore.map((row) => row.modelId))
    const newcomers = before.size
      ? latestRows
          .filter((row) => row.rank !== null && !before.has(row.modelId))
          .map(({ modelId, name, org, rank }) => ({ modelId, name, org, rank }))
      : []

    return { week: latest.week, computedAt: latest.computedAt.toISOString(), rows: latestRows, trend, newcomers }
  },
  ['rankings-board'],
  cacheOptions,
)

/** Counted votes in an arena now (rule 14): the number in the page heading. */
export const getCountedVotes = cached(
  async (arenaId: number): Promise<number> => {
    const { db } = await getDb()
    const [row] = await db
      .select({ votes: count() })
      .from(arenaBattles)
      .where(and(eq(arenaBattles.arenaId, arenaId), eq(arenaBattles.counted, true)))
    return Number(row?.votes ?? 0)
  },
  ['rankings-votes'],
  cacheOptions,
)
