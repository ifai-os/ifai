import { count, desc, max } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import { collectEnabled } from '@/lib/switches'

import { externalSnapshots } from '../schema'
import { aaApiKey, boardsOf, externalSources, type BoardLabel, type ExternalSource } from './sources'

/** One outside board in the back office: its newest published day, when we stored it, how many days we have. */
export type ExternalStatusRow = {
  source: ExternalSource
  board: string
  label: BoardLabel
  /** The newest day the source published that we have; null before the first import. */
  latest: string | null
  /** When that day was stored. */
  fetchedAt: string | null
  models: number | null
  days: number
}

export type ExternalStatus = {
  /** COLLECT_ENABLED: without it the daily sync and「现在同步」skip. */
  collecting: boolean
  /** Whether ARTIFICIAL_ANALYSIS_API_KEY is set: without it Artificial Analysis is not synced. */
  aaKey: boolean
  boards: ExternalStatusRow[]
}

/** Every outside board in each source's order, imported or not. */
export async function externalStatus(): Promise<ExternalStatus> {
  const { db } = await getDb()
  const [totals, newest] = await Promise.all([
    db
      .select({ source: externalSnapshots.source, board: externalSnapshots.board, days: count(), latest: max(externalSnapshots.publishedOn) })
      .from(externalSnapshots)
      .groupBy(externalSnapshots.source, externalSnapshots.board),
    db
      .selectDistinctOn([externalSnapshots.source, externalSnapshots.board], {
        source: externalSnapshots.source,
        board: externalSnapshots.board,
        fetchedAt: externalSnapshots.fetchedAt,
        models: externalSnapshots.models,
      })
      .from(externalSnapshots)
      .orderBy(externalSnapshots.source, externalSnapshots.board, desc(externalSnapshots.publishedOn)),
  ])
  const key = (source: string, board: string) => `${source}/${board}`
  const totalOf = new Map(totals.map((row) => [key(row.source, row.board), row]))
  const newestOf = new Map(newest.map((row) => [key(row.source, row.board), row]))

  return {
    collecting: collectEnabled(),
    aaKey: aaApiKey() !== null,
    boards: externalSources.flatMap((source) =>
      boardsOf(source).map((board) => {
        const total = totalOf.get(key(source, board.slug))
        const latest = newestOf.get(key(source, board.slug))
        return {
          source,
          board: board.slug,
          label: board.label,
          latest: total?.latest ?? null,
          fetchedAt: latest ? latest.fetchedAt.toISOString() : null,
          models: latest?.models ?? null,
          days: Number(total?.days ?? 0),
        }
      }),
    ),
  }
}
