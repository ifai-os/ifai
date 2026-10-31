/**
 * The outside leaderboards shown beside IFAI's own blind test (docs/specs/rankings.md「外部榜单」):
 * which sources and boards there are, their addresses, and the pure rules the import, the job and
 * the pages share. Each source keeps its own boards, scores and ranks; nothing here is merged with
 * another source or with the blind test.
 */
import type { Weights } from '../rules'

export const externalSources = ['arena', 'artificial-analysis'] as const
export type ExternalSource = (typeof externalSources)[number]

export const isExternalSource = (value: unknown): value is ExternalSource => (externalSources as readonly unknown[]).includes(value)

/** A board's name in messages (`rankingsExternal.boards.<label>`). Boards of both sources share the names. */
export type BoardLabel =
  | 'text'
  | 'webdev'
  | 'vision'
  | 'document'
  | 'search'
  | 'textToImage'
  | 'imageEdit'
  | 'textToVideo'
  | 'imageToVideo'
  | 'videoEdit'
  | 'intelligence'
  | 'textToSpeech'

export type ArenaBoard = {
  slug: string
  label: BoardLabel
  /**
   * The subset of Arena's dataset. Where the arena has a style-controlled leaderboard, that one:
   * it is what arena.ai shows by default (since May 2025).
   */
  subset: string
}

/** Arena's leaderboards, in the order of its site; the first is the one /rankings/arena opens on. */
export const arenaBoards: readonly ArenaBoard[] = [
  { slug: 'text', label: 'text', subset: 'text_style_control' },
  { slug: 'webdev', label: 'webdev', subset: 'webdev' },
  { slug: 'vision', label: 'vision', subset: 'vision_style_control' },
  { slug: 'document', label: 'document', subset: 'document_style_control' },
  { slug: 'search', label: 'search', subset: 'search_style_control' },
  { slug: 'text-to-image', label: 'textToImage', subset: 'text_to_image' },
  { slug: 'image-edit', label: 'imageEdit', subset: 'image_edit' },
  { slug: 'text-to-video', label: 'textToVideo', subset: 'text_to_video' },
  { slug: 'image-to-video', label: 'imageToVideo', subset: 'image_to_video' },
  { slug: 'video-edit', label: 'videoEdit', subset: 'video_edit' },
]

/** Where Arena publishes the history of its leaderboards (CC BY 4.0). */
export const ARENA_DATASET = 'lmarena-ai/leaderboard-dataset'
export const ARENA_DATASET_URL = `https://huggingface.co/datasets/${ARENA_DATASET}`
export const ARENA_SITE_URL = 'https://arena.ai/leaderboard'
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/'

/** The leaderboard of each board we take: the whole board, not one of its categories (coding, Chinese…). */
export const ARENA_CATEGORY = 'overall'

export type AaBoard = {
  slug: string
  label: BoardLabel
  /** The free-tier list it comes from (Artificial Analysis API v2). */
  path: `/api/v2/${string}/free`
  /** `index`: the Intelligence Index of language models, paginated; `arena`: a blind-vote arena's Elo and 95% interval. */
  kind: 'index' | 'arena'
}

/** Artificial Analysis's boards we take, from its free API; the first is the one /rankings/artificial-analysis opens on. */
export const aaBoards: readonly AaBoard[] = [
  { slug: 'intelligence', label: 'intelligence', path: '/api/v2/language/models/free', kind: 'index' },
  { slug: 'text-to-image', label: 'textToImage', path: '/api/v2/media/text-to-image/models/free', kind: 'arena' },
  { slug: 'image-edit', label: 'imageEdit', path: '/api/v2/media/image-editing/models/free', kind: 'arena' },
  { slug: 'text-to-video', label: 'textToVideo', path: '/api/v2/media/text-to-video/models/free', kind: 'arena' },
  { slug: 'image-to-video', label: 'imageToVideo', path: '/api/v2/media/image-to-video/models/free', kind: 'arena' },
  { slug: 'text-to-speech', label: 'textToSpeech', path: '/api/v2/media/text-to-speech/models/free', kind: 'arena' },
]

export const AA_API_URL = 'https://artificialanalysis.ai'
export const AA_SITE_URL = 'https://artificialanalysis.ai/'

type Env = Record<string, string | undefined>

/**
 * ARTIFICIAL_ANALYSIS_API_KEY (a free key from artificialanalysis.ai): without it the daily sync
 * leaves Artificial Analysis alone, and its boards stay empty and off the「数据来源」buttons.
 */
export const aaApiKey = (env: Env = process.env): string | null => env.ARTIFICIAL_ANALYSIS_API_KEY?.trim() || null

export type BoardRef = {
  source: ExternalSource
  slug: string
  label: BoardLabel
  /** Decimals of a score: Elo ratings are whole numbers, the Intelligence Index has one. */
  digits: 0 | 1
}

/** The boards of a source, in order. */
export function boardsOf(source: ExternalSource): BoardRef[] {
  if (source === 'arena') return arenaBoards.map(({ slug, label }) => ({ source, slug, label, digits: 0 }))
  return aaBoards.map(({ slug, label, kind }) => ({ source, slug, label, digits: kind === 'index' ? 1 : 0 }))
}

export function findBoard(source: ExternalSource, slug: string): BoardRef | null {
  return boardsOf(source).find((board) => board.slug === slug) ?? null
}

/** A source's address, or one of its boards' (the first board lives at the source's own address). */
export function externalHref(source: ExternalSource, board: string | null = null, filters: ExternalFilters = { weights: null }): `/${string}` {
  const first = boardsOf(source)[0]?.slug
  const path: `/${string}` = board && board !== first ? `/rankings/${source}/${board}` : `/rankings/${source}`
  const query = new URLSearchParams()
  if (filters.weights) query.set('weights', filters.weights)
  return query.size ? `${path}?${query}` : path
}

export type ExternalFilters = { weights: Weights | null }

/**
 * 开放权重 / 闭源 from the license a source gives: Arena writes "Proprietary" for closed models and
 * the license's name (Apache 2.0, MIT, Llama 3.1 Community…) for open-weights ones. Null when the
 * source gives no license.
 */
export function weightsOf(license: string | null | undefined): Weights | null {
  const name = license?.trim()
  if (!name) return null
  return name.toLowerCase() === 'proprietary' ? 'closed' : 'open'
}

/** Makers whose spelling a key cannot give (Arena writes keys like "openai", "zai", "bfl"). */
const makerNames: Record<string, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  alibaba: 'Alibaba',
  xai: 'xAI',
  meta: 'Meta',
  deepseek: 'DeepSeek',
  zai: 'Z.ai',
  mistral: 'Mistral',
  bytedance: 'ByteDance',
  minimax: 'MiniMax',
  tencent: 'Tencent',
  xiaomi: 'Xiaomi',
  bfl: 'Black Forest Labs',
  moonshot: 'Moonshot AI',
  nvidia: 'NVIDIA',
  stepfun: 'StepFun',
  amazon: 'Amazon',
  kling: 'Kling',
  allenai: 'Ai2',
  ibm: 'IBM',
  microsoft: 'Microsoft',
  'microsoft-ai': 'Microsoft AI',
  reve: 'Reve',
  'luma-ai': 'Luma AI',
  cohere: 'Cohere',
  thinky: 'Thinking Machines',
  baidu: 'Baidu',
  recraft: 'Recraft',
  upstage: 'Upstage',
  ideogram: 'Ideogram',
  krea: 'Krea',
  runway: 'Runway',
  'inception-ai': 'Inception',
  shengshu: 'Shengshu',
  meituan: 'Meituan',
  'ant-group': 'Ant Group',
  perplexity: 'Perplexity',
  hidream: 'HiDream',
  'leonardo-ai': 'Leonardo.Ai',
  '01-ai': '01.AI',
}

/** A maker as readers know it: the known spellings, otherwise the key's words capitalised ("poolside" → "Poolside"). */
export function makerName(key: string | null | undefined): string {
  const name = key?.trim() ?? ''
  if (!name) return ''
  const known = makerNames[name.toLowerCase()]
  if (known) return known
  // A source that already writes names ("Black Forest Labs") keeps them.
  if (/[A-Z\s]/.test(name)) return name
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (word === 'ai' ? 'AI' : word[0].toUpperCase() + word.slice(1)))
    .join(' ')
}

/** One model's line on a board, as the source published it. */
export type ExternalRow = {
  rank: number
  model: string
  /** The maker as the source writes it (a key for Arena); null when the source leaves it empty. */
  org: string | null
  /** The license's name; null when the source gives none. */
  license: string | null
  weights: Weights | null
  score: number
  /** The 95% interval, when the source gives one. */
  lower: number | null
  upper: number | null
  /** Battles (Arena); null when the source does not say. */
  votes: number | null
}

/** One board on one day: the day the source published it, and its models by rank. */
export type ExternalSnapshot = { publishedOn: string; rows: ExternalRow[] }

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

const finite = (value: unknown): number | null => {
  const number = typeof value === 'bigint' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * Arena's dataset rows (one per model, category and publish day) as snapshots of the whole board,
 * oldest first. Rows of other categories, and rows without a model, a score, a place or a day, are
 * left out and counted. Two lines with the same name stay, as Arena lists them (it has two
 * entries for some models); only a line repeated exactly is dropped.
 */
export function arenaSnapshotsFrom(records: readonly Record<string, unknown>[]): { snapshots: ExternalSnapshot[]; skipped: number } {
  const byDay = new Map<string, Map<string, ExternalRow>>()
  let skipped = 0
  for (const record of records) {
    if (record.category !== ARENA_CATEGORY) {
      skipped += 1
      continue
    }
    const day = record.leaderboard_publish_date
    const model = text(record.model_name)
    const score = finite(record.rating)
    const rank = finite(record.rank)
    if (!isDay(day) || !model || score === null || rank === null || rank < 1 || !Number.isInteger(rank)) {
      skipped += 1
      continue
    }
    const license = text(record.license)
    const votes = finite(record.vote_count)
    const row: ExternalRow = {
      rank,
      model,
      org: text(record.organization),
      license,
      weights: weightsOf(license),
      score,
      lower: finite(record.rating_lower),
      upper: finite(record.rating_upper),
      votes: votes === null ? null : Math.round(votes),
    }
    const rows = byDay.get(day) ?? new Map<string, ExternalRow>()
    const key = JSON.stringify(row)
    if (rows.has(key)) skipped += 1
    else rows.set(key, row)
    byDay.set(day, rows)
  }
  const snapshots = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([publishedOn, rows]) => ({ publishedOn, rows: sortRows([...rows.values()]) }))
  return { snapshots, skipped }
}

/** By place, then by score, then by name: the same order however the source listed them. */
export function sortRows(rows: ExternalRow[]): ExternalRow[] {
  return rows.sort((a, b) => a.rank - b.rank || b.score - a.score || a.model.localeCompare(b.model))
}

/** Places from scores, highest first, for a source that gives none: equal scores share a place (1, 2, 2, 4). */
export function rankByScore(rows: readonly Omit<ExternalRow, 'rank'>[]): ExternalRow[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))
  let rank = 0
  return sorted.map((row, index) => {
    if (index === 0 || row.score !== sorted[index - 1].score) rank = index + 1
    return { ...row, rank }
  })
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

/**
 * One of Artificial Analysis's free lists as a board (docs/specs/rankings.md「外部榜单」): the
 * Intelligence Index of language models, or an arena's Elo with its 95% interval. The free tier
 * gives no licenses and no vote counts, and no places: they come from the scores. Models without a
 * score are left out and counted. Two entries with the same name stay; only one repeated exactly is dropped.
 */
export function aaRowsFrom(kind: AaBoard['kind'], models: readonly unknown[]): { rows: ExternalRow[]; skipped: number } {
  const kept = new Map<string, Omit<ExternalRow, 'rank'>>()
  let skipped = 0
  for (const item of models) {
    const model = record(item)
    const name = text(model.name)
    const score = finite(kind === 'index' ? record(model.evaluations).artificial_analysis_intelligence_index : model.elo)
    if (!name || score === null) {
      skipped += 1
      continue
    }
    const interval = kind === 'arena' ? finite(model.ci_95) : null
    const row = {
      model: name,
      org: text(record(model.model_creator).name),
      license: null,
      weights: null,
      score,
      lower: interval === null ? null : score - interval,
      upper: interval === null ? null : score + interval,
      votes: null,
    }
    const key = JSON.stringify(row)
    if (kept.has(key)) skipped += 1
    else kept.set(key, row)
  }
  return { rows: rankByScore([...kept.values()]), skipped }
}

export type ExternalTrendPoint = { day: string; open: number | null; closed: number | null }

/** 「分数走势」covers this many months: one point a month, the month's last published board. */
export const TREND_MONTHS = 24

/**
 * The trend's points from every published board of a board (oldest first): the last board of each
 * month, for the latest `months` months that have one.
 */
export function monthlyPoints<T extends { day: string }>(points: readonly T[], months = TREND_MONTHS): T[] {
  const byMonth = new Map<string, T>()
  for (const point of [...points].sort((a, b) => a.day.localeCompare(b.day))) byMonth.set(point.day.slice(0, 7), point)
  return [...byMonth.values()].slice(-months)
}

/** The table shows this many models; the rest open under it. */
export const TABLE_SHOWN = 50

/** ?weights=open → the table's license filter; anything else is no filter. */
export function readExternalFilters(params: Record<string, string | string[] | undefined>): ExternalFilters {
  const raw = Array.isArray(params.weights) ? params.weights[0] : params.weights
  return { weights: raw === 'open' || raw === 'closed' ? raw : null }
}
