import { parquetReadObjects } from 'hyparquet'

import { siteUrl } from '@/lib/site-url'

import { ARENA_CATEGORY, ARENA_DATASET, arenaSnapshotsFrom, type ArenaBoard, type ExternalSnapshot } from './sources'

/**
 * Arena's leaderboards from the dataset it publishes on Hugging Face (CC BY 4.0, docs/specs/rankings.md
 * 「外部榜单」): one subset per arena, each with a `latest` split (the newest published board) and a
 * `full` one (every board it ever published). Read as parquet files, only the columns and the
 * category we keep. Arena's own site is never fetched: its terms forbid scraping.
 */

export type ArenaSplit = 'latest' | 'full'

const API = `https://huggingface.co/api/datasets/${ARENA_DATASET}`
const FILES = `https://huggingface.co/datasets/${ARENA_DATASET}/resolve/main/`

/** The columns we read; the dataset has a few more (variance). */
const COLUMNS = ['model_name', 'organization', 'license', 'rating', 'rating_lower', 'rating_upper', 'vote_count', 'rank', 'category', 'leaderboard_publish_date']

/** The largest file we download: the text arena's whole history is about 60 MB. */
const MAX_FILE_BYTES = 256 * 1024 * 1024

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The parquet files of a subset's split ("text_style_control/full-00000-of-00001.parquet"), from the dataset's file list. */
export function splitFiles(listing: unknown, subset: string, split: ArenaSplit): string[] {
  if (!Array.isArray(listing)) return []
  const pattern = new RegExp(`^${escape(subset)}/${split}-\\d+-of-\\d+\\.parquet$`)
  return listing
    .flatMap((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return entry.type === 'file' && typeof entry.path === 'string' && pattern.test(entry.path) ? [entry.path] : []
    })
    .sort()
}

type Fetch = typeof fetch

/** Who is asking, like the daily collector's requests. */
const userAgent = () => `IFAIBot/0.1 (+${siteUrl()})`

async function fetchOk(fetcher: Fetch, url: string, accept: string, timeoutMs: number): Promise<Response> {
  const response = await fetcher(url, {
    headers: { 'user-agent': userAgent(), accept },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response
}

async function download(fetcher: Fetch, url: string): Promise<ArrayBuffer> {
  const response = await fetchOk(fetcher, url, 'application/octet-stream', 120_000)
  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_FILE_BYTES) throw new Error(`${url}: ${declared} bytes is more than we read`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(`${url}: ${buffer.byteLength} bytes is more than we read`)
  return buffer
}

/**
 * One of Arena's boards from its dataset: the newest published board (`latest`) or all of them
 * (`full`), oldest first, with how many rows were left out.
 */
export async function readArenaBoard(
  board: ArenaBoard,
  split: ArenaSplit,
  fetcher: Fetch = fetch,
): Promise<{ snapshots: ExternalSnapshot[]; skipped: number; files: string[] }> {
  const listing = await (await fetchOk(fetcher, `${API}/tree/main/${board.subset}`, 'application/json', 30_000)).json()
  const files = splitFiles(listing, board.subset, split)
  if (files.length === 0) throw new Error(`Arena's dataset has no ${split} files for ${board.subset}`)
  const records: Record<string, unknown>[] = []
  for (const path of files) {
    const file = await download(fetcher, FILES + path)
    // The category filter skips the row groups of other categories without decoding them.
    records.push(...(await parquetReadObjects({ file, columns: COLUMNS, filter: { category: { $eq: ARENA_CATEGORY } } })))
  }
  return { ...arenaSnapshotsFrom(records), files }
}
