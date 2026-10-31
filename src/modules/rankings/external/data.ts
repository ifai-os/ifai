import { and, desc, eq, inArray, max, sql } from '@payloadcms/db-postgres/drizzle'

import { cached } from '@/lib/data-cache'
import { getDb } from '@/lib/db/drizzle'

import { rankingsCacheTag } from '../cache'
import { externalRows, externalSnapshots } from '../schema'
import { boardsOf, makerName, monthlyPoints, type BoardRef, type ExternalRow, type ExternalSource, type ExternalTrendPoint } from './sources'

/**
 * What the outside boards' pages read (docs/specs/rankings.md「外部榜单」): a board's newest
 * published day with its models, and one point a month for「分数走势」. Cached for an hour under
 * the rankings tag, which the import job refreshes.
 */

const cacheOptions = { tags: [rankingsCacheTag], revalidate: 3600 }

/** A line of the table: the source's row, with the maker spelled for readers. */
export type ExternalBoardRow = ExternalRow & { maker: string }

export type ExternalBoard = {
  /** The day the source published the newest board we have; null before the first import. */
  publishedOn: string | null
  rows: ExternalBoardRow[]
  /** The last published board of each month, oldest first: the best closed and open-weights scores. */
  trend: ExternalTrendPoint[]
  /** The first day of the board's history we have, and how many published days we have since. */
  since: string | null
  days: number
}

const emptyBoard: ExternalBoard = { publishedOn: null, rows: [], trend: [], since: null, days: 0 }

/** A board's newest published day, its models by rank, and its monthly trend. */
export const getExternalBoard = cached(
  async (source: ExternalSource, board: string): Promise<ExternalBoard> => {
    const { db } = await getDb()
    const days = await db
      .select({ id: externalSnapshots.id, day: externalSnapshots.publishedOn })
      .from(externalSnapshots)
      .where(and(eq(externalSnapshots.source, source), eq(externalSnapshots.board, board)))
      .orderBy(desc(externalSnapshots.publishedOn))
    const latest = days[0]
    if (!latest) return emptyBoard

    const points = monthlyPoints(days)
    const [rows, best] = await Promise.all([
      db
        .select({
          rank: externalRows.rank,
          model: externalRows.model,
          org: externalRows.org,
          license: externalRows.license,
          weights: externalRows.weights,
          score: externalRows.score,
          lower: externalRows.lower,
          upper: externalRows.upper,
          votes: externalRows.votes,
        })
        .from(externalRows)
        .where(eq(externalRows.snapshotId, latest.id))
        .orderBy(externalRows.rank, desc(externalRows.score), externalRows.id),
      db
        .select({
          snapshotId: externalRows.snapshotId,
          open: sql<number | null>`max(${externalRows.score}) filter (where ${externalRows.weights} = 'open')`,
          closed: sql<number | null>`max(${externalRows.score}) filter (where ${externalRows.weights} = 'closed')`,
        })
        .from(externalRows)
        .where(inArray(externalRows.snapshotId, points.map((point) => point.id)))
        .groupBy(externalRows.snapshotId),
    ])
    const bestBySnapshot = new Map(best.map((row) => [row.snapshotId, row]))
    const number = (value: number | string | null | undefined) => (value === null || value === undefined ? null : Number(value))

    return {
      publishedOn: latest.day,
      rows: rows.map((row) => ({ ...row, maker: makerName(row.org) })),
      trend: points.map((point) => ({
        day: point.day,
        open: number(bestBySnapshot.get(point.id)?.open),
        closed: number(bestBySnapshot.get(point.id)?.closed),
      })),
      since: days[days.length - 1]?.day ?? null,
      days: days.length,
    }
  },
  ['rankings-external-board'],
  cacheOptions,
)

/** A board that has a published day, and its newest one. */
export type StoredBoard = BoardRef & { publishedOn: string }

/** The boards of each source that have a published day, in each source's order: the pages offer only those. */
export const getExternalBoards = cached(
  async (): Promise<Record<ExternalSource, StoredBoard[]>> => {
    const { db } = await getDb()
    const stored = await db
      .select({ source: externalSnapshots.source, board: externalSnapshots.board, latest: max(externalSnapshots.publishedOn) })
      .from(externalSnapshots)
      .groupBy(externalSnapshots.source, externalSnapshots.board)
    const latest = new Map(stored.map((row) => [`${row.source}/${row.board}`, row.latest]))
    const withData = (source: ExternalSource) =>
      boardsOf(source).flatMap((board) => {
        const publishedOn = latest.get(`${source}/${board.slug}`)
        return publishedOn ? [{ ...board, publishedOn }] : []
      })
    return { arena: withData('arena'), 'artificial-analysis': withData('artificial-analysis') }
  },
  ['rankings-external-boards'],
  cacheOptions,
)
