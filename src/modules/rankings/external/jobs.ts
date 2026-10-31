import { inngest } from '@/lib/inngest/client'
import { shanghaiDate } from '@/lib/shanghai-day'
import { collectEnabled } from '@/lib/switches'

import { refreshRankingsCache } from '../cache'
import { externalImportEvent } from '../events'
import { readAaBoard } from './aa'
import { readArenaBoard, type ArenaSplit } from './arena'
import { aaApiKey, aaBoards, arenaBoards, type AaBoard, type ArenaBoard } from './sources'
import { hasSnapshots, latestSnapshot, rowsChecksum, storeSnapshots } from './store'

/** Monday's run reads every board's whole history again, so a day the source corrected is replaced. */
export const isFullSyncDay = (shanghaiDay: string) => new Date(`${shanghaiDay}T00:00:00Z`).getUTCDay() === 1

/**
 * One of Arena's boards: its newest published board, or its whole history the first time and on
 * Mondays (`full`). Returns what was stored.
 */
export async function importArenaBoard(board: ArenaBoard, full: boolean) {
  const split: ArenaSplit = full || !(await hasSnapshots('arena', board.slug)) ? 'full' : 'latest'
  const { snapshots, skipped } = await readArenaBoard(board, split)
  const stored = await storeSnapshots('arena', board.slug, snapshots)
  return { split, days: snapshots.length, skipped, ...stored }
}

/**
 * One of Artificial Analysis's boards as it is today. It has no publish days, so a day is stored
 * only when the numbers changed since the last one we have: the board's days are the days it changed.
 */
export async function importAaBoard(board: AaBoard, apiKey: string, day: string, fetcher: typeof fetch = fetch) {
  const { rows, skipped, requests } = await readAaBoard(board, apiKey, fetcher)
  if (rows.length === 0) throw new Error(`Artificial Analysis ${board.slug}: no models with a score`)
  const latest = await latestSnapshot('artificial-analysis', board.slug)
  if (latest && latest.publishedOn < day && latest.checksum === rowsChecksum(rows)) {
    return { requests, models: rows.length, skipped, added: 0, replaced: 0, unchanged: 1, latest: latest.publishedOn }
  }
  const stored = await storeSnapshots('artificial-analysis', board.slug, [{ publishedOn: day, rows }])
  return { requests, models: rows.length, skipped, ...stored }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Every morning at 07:30 Shanghai time, and on「现在同步」in the back office (docs/specs/rankings.md
 * 「外部榜单」): each outside board, one step each, then the rankings pages are refreshed. A board
 * that still fails after its retries is reported and the others go on; tomorrow's run picks it up.
 * Runs only with COLLECT_ENABLED, like the other scheduled fetching; Artificial Analysis also
 * needs its API key.
 */
export const externalImportJob = inngest.createFunction(
  {
    id: 'rankings-external',
    triggers: [{ cron: 'TZ=Asia/Shanghai 30 7 * * *' }, { event: externalImportEvent }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ event, step }) => {
    if (!collectEnabled()) return { skipped: 'COLLECT_ENABLED is not "true"' }
    const data = (event.data ?? {}) as { full?: unknown }
    const day = await step.run('day', () => shanghaiDate())
    const full = data.full === true || isFullSyncDay(day)
    const boards: Record<string, unknown> = {}
    for (const board of arenaBoards) {
      try {
        boards[`arena/${board.slug}`] = await step.run(`arena-${board.slug}`, () => importArenaBoard(board, full))
      } catch (error) {
        boards[`arena/${board.slug}`] = { error: message(error) }
      }
    }
    const apiKey = aaApiKey()
    for (const board of apiKey ? aaBoards : []) {
      try {
        boards[`artificial-analysis/${board.slug}`] = await step.run(`aa-${board.slug}`, () => importAaBoard(board, apiKey as string, day))
      } catch (error) {
        boards[`artificial-analysis/${board.slug}`] = { error: message(error) }
      }
    }
    await step.run('refresh-pages', () => {
      refreshRankingsCache()
      return true
    })
    return { full, boards }
  },
)

export const externalFunctions = [externalImportJob]
