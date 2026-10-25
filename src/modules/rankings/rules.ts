/**
 * The model arena's rules (docs/specs/rankings.md「已定的规则」): the pure parts, so they can be
 * tested without a database. Collections, jobs, the vote API and the pages all read them here.
 */
import { isLocale, type Locale } from '@/i18n/config'

export const arenaStatuses = ['draft', 'published'] as const
export type ArenaStatus = (typeof arenaStatuses)[number]

/** What an arena's answers are: text, or one picture each (「图像生成赛道」). */
export const arenaKinds = ['text', 'image'] as const
export type ArenaKind = (typeof arenaKinds)[number]

/** 备赛 (answers only), 参赛 (in battles and rankings), 退役 (neither; its votes stay). */
export const modelStatuses = ['draft', 'active', 'retired'] as const
export type ModelStatus = (typeof modelStatuses)[number]

export const promptStatuses = ['active', 'retired'] as const
export type PromptStatus = (typeof promptStatuses)[number]

export const answerStatuses = ['pending', 'done', 'failed'] as const
export type AnswerStatus = (typeof answerStatuses)[number]

/** 开放权重 / 闭源 (rule 10): never "open source", which would need a license check. */
export const weightsKinds = ['open', 'closed'] as const
export type Weights = (typeof weightsKinds)[number]

/** Where the maker is based (rule 11). */
export const regions = ['us', 'cn', 'eu', 'other'] as const
export type Region = (typeof regions)[number]

/** A vote: A is better, B is better, about the same, both bad (rule 7). */
export const outcomes = ['a', 'b', 'tie', 'bad'] as const
export type Outcome = (typeof outcomes)[number]

export const isOutcome = (value: unknown): value is Outcome => (outcomes as readonly unknown[]).includes(value)

/** The languages questions are written in (rule 5); Traditional Chinese pages get the Simplified ones. */
export const promptLangs = ['en', 'zh-Hans', 'ja', 'ko'] as const
export type PromptLang = (typeof promptLangs)[number]

export function promptLangFor(locale: Locale): PromptLang {
  return locale === 'zh-Hant' ? 'zh-Hans' : locale
}

/** Slugs that are pages under /rankings, not arenas. */
export const reservedArenaSlugs = ['vote'] as const

/** A question is at most this long (characters). */
export const PROMPT_MAX_LENGTH = 2000
/** An answer may use this many output tokens; one that runs into it is cut off and left out (rule 6). */
export const ANSWER_MAX_TOKENS = 4000
/** The answer job handles at most this many answers per run. */
export const ANSWERS_PER_RUN = 30

/** Counted votes per member per Shanghai day (rule 7). */
export const DAILY_VOTES = 200
/** Questions a member may open per Shanghai day, skipped ones included. */
export const DAILY_BATTLES = 600
/** A vote cast sooner than this after the question appeared is kept but not counted (rule 7). */
export const MIN_READ_MS = 4000
/** A question can be voted on for this long after it was opened. */
export const BATTLE_TTL_MS = 2 * 60 * 60 * 1000
/** Questions nobody voted on are deleted after this long (the weekly job). */
export const STALE_BATTLE_MS = 2 * 24 * 60 * 60 * 1000
/** The questions a member voted on most recently are not shown to them again. */
export const RECENT_PROMPTS = 50

/** Fewer counted votes than this: provisional, without a place (rule 9). */
export const PROVISIONAL_UNDER = 300
/** Places shown in「前 10」. */
export const TOP_SHOWN = 10
/** 「按厂商」counts the models among this many places, for this many makers. */
export const LABS_AMONG = 30
export const LABS_SHOWN = 5
/** 「分数走势」covers this many weekly snapshots. */
export const TREND_WEEKS = 12
/** 「新上榜」shows at most this many models. */
export const NEWCOMERS_SHOWN = 3

/** Default for ARENA_DAILY_BUDGET_USD (rule 13). */
export const DEFAULT_ARENA_BUDGET_USD = 2

/** ARENA_DAILY_BUDGET_USD when it is a number ≥ 0, otherwise the default. */
export function arenaBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.ARENA_DAILY_BUDGET_USD
  const value = Number(raw)
  return raw?.trim() && Number.isFinite(value) && value >= 0 ? value : DEFAULT_ARENA_BUDGET_USD
}

/** Whether a vote counts toward the rankings: the voter had time to read both answers (rule 7). */
export function isCountedVote(openedAt: Date, votedAt: Date): boolean {
  return votedAt.getTime() - openedAt.getTime() >= MIN_READ_MS
}

/** Whether a question opened at `openedAt` can still be voted on at `now`. */
export function isOpenBattle(openedAt: Date, now: Date): boolean {
  return now.getTime() - openedAt.getTime() <= BATTLE_TTL_MS
}

/** Name parts too common to give a model away: "Gemini 2.5 Flash" is given away by "gemini", not by "flash". */
const commonWords = new Set([
  'ai',
  'chat',
  'instruct',
  'preview',
  'latest',
  'mini',
  'nano',
  'pro',
  'max',
  'plus',
  'flash',
  'lite',
  'large',
  'medium',
  'small',
  'turbo',
  'fast',
  'thinking',
  'reasoning',
  'base',
  'the',
  'and',
  'inc',
  'labs',
  'lab',
  'model',
  'models',
])

/**
 * Words of the model's name and its maker's names that would tell a voter who wrote the answer:
 * Latin words of three letters or more ("qwen3" also as "qwen"), other scripts of two or more.
 */
export function giveawayWords(model: { name: string; org: readonly string[] }): string[] {
  const words = [model.name, ...model.org]
    .flatMap((text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .flatMap((word) => {
      const letters = word.match(/^([a-z]+)\d+$/)?.[1]
      return letters ? [word, letters] : [word]
    })
    .filter((word) => {
      if (/^\d/.test(word) || commonWords.has(word)) return false
      return /^[a-z0-9]+$/.test(word) ? word.length >= 3 : word.length >= 2
    })
  return [...new Set(words)]
}

/** The answer names its own model or maker, so it would not be blind (rule 6). */
export function namesItself(text: string, model: { name: string; org: readonly string[] }): boolean {
  const lower = text.toLowerCase()
  return giveawayWords(model).some((word) => {
    // Latin words count only as whole words ("gemini", not "geminid"); CJK names anywhere.
    if (/^[a-z0-9]+$/.test(word)) return new RegExp(`(^|[^a-z0-9])${word}($|[^a-z0-9])`).test(lower)
    return lower.includes(word)
  })
}

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'code'; text: string; lang: string | null }

/**
 * An answer as text and fenced code blocks, for display (rule 6: plain text, code in fences).
 * Everything else a model writes stays text; an unclosed fence runs to the end.
 */
export function answerParts(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  const lines = answer.replace(/\r\n?/g, '\n').split('\n')
  let text: string[] = []
  let code: string[] | null = null
  let lang: string | null = null
  let fence = ''
  const flushText = () => {
    const joined = text.join('\n').replace(/^\n+|\n+$/g, '')
    if (joined.trim()) parts.push({ kind: 'text', text: joined })
    text = []
  }
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/)
    if (code === null && match) {
      flushText()
      code = []
      fence = match[1]
      lang = match[2] || null
    } else if (code !== null && match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2]) {
      parts.push({ kind: 'code', text: code.join('\n'), lang })
      code = null
    } else if (code !== null) {
      code.push(line)
    } else {
      text.push(line)
    }
  }
  if (code !== null) parts.push({ kind: 'code', text: code.join('\n'), lang })
  flushText()
  return parts
}

/**
 * 性价比: the models no other model beats on both cost and score, cheapest first. Each one
 * scores higher than every cheaper model, so the line only climbs.
 */
export function valueFrontier<T extends { costUsd: number; score: number }>(points: readonly T[]): T[] {
  const sorted = [...points].sort((a, b) => a.costUsd - b.costUsd || b.score - a.score)
  const frontier: T[] = []
  for (const point of sorted) {
    if (frontier.length === 0 || point.score > frontier[frontier.length - 1].score) frontier.push(point)
  }
  return frontier
}

export type BoardFilters = { weights: Weights | null; region: Region | null }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** ?weights=open&region=cn → the table's filters; anything else is no filter. */
export function readBoardFilters(params: Record<string, string | string[] | undefined>): BoardFilters {
  const weights = first(params.weights)
  const region = first(params.region)
  return {
    weights: (weightsKinds as readonly string[]).includes(weights ?? '') ? (weights as Weights) : null,
    region: (regions as readonly string[]).includes(region ?? '') ? (region as Region) : null,
  }
}

/** The address of an arena's board with filters; the first arena lives at /rankings itself. */
export function boardHref(arena: string | null, filters: BoardFilters = { weights: null, region: null }): `/${string}` {
  const query = new URLSearchParams()
  if (filters.weights) query.set('weights', filters.weights)
  if (filters.region) query.set('region', filters.region)
  const path: `/${string}` = arena ? `/rankings/${arena}` : '/rankings'
  return query.size ? `${path}?${query}` : path
}

/** The vote page for an arena. */
export function voteHref(arena: string | null): `/${string}` {
  return arena ? `/rankings/vote?arena=${encodeURIComponent(arena)}` : '/rankings/vote'
}

export type TrendPoint = { week: string; open: number | null; closed: number | null }

/** The gap between the best closed and best open-weights model, first and last week that have both. */
export function trendGap(points: readonly TrendPoint[]): { from: number; to: number } | null {
  const both = points.filter((point) => point.open !== null && point.closed !== null)
  if (both.length < 2) return null
  const gap = (point: TrendPoint) => Math.round((point.closed as number) - (point.open as number))
  return { from: gap(both[0]), to: gap(both[both.length - 1]) }
}

/** The Monday (YYYY-MM-DD) of the Shanghai week that `shanghaiDay` (YYYY-MM-DD) falls in. */
export function weekOf(shanghaiDay: string): string {
  const date = new Date(`${shanghaiDay}T00:00:00Z`)
  const back = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `POST /api/rankings/battles { arena?, locale }`: the arena's slug (none for the first) and the page's language. */
export function parseOpenInput(body: unknown): { arena: string | null; locale: Locale } | null {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const arena = input.arena === undefined || input.arena === null || input.arena === '' ? null : input.arena
  if (arena !== null && (typeof arena !== 'string' || arena.length > 80 || !slugPattern.test(arena))) return null
  if (!isLocale(input.locale)) return null
  return { arena, locale: input.locale }
}

/** `POST /api/rankings/battles/<id>/vote { outcome, locale }`. */
export function parseVoteInput(body: unknown): { outcome: Outcome; locale: Locale } | null {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  return isOutcome(input.outcome) && isLocale(input.locale) ? { outcome: input.outcome, locale: input.locale } : null
}

/** A question's id as the vote page got it: 24 URL-safe characters. */
export function isBattleId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value)
}

/** 「按厂商」: the makers with the most models among the first 30 places, most first (then the best place). */
export function topMakers(rows: readonly { rank: number | null; org: string }[]): { org: string; models: number }[] {
  const byOrg = new Map<string, { org: string; models: number; best: number }>()
  for (const row of rows) {
    if (row.rank === null || row.rank > LABS_AMONG || !row.org) continue
    const entry = byOrg.get(row.org) ?? { org: row.org, models: 0, best: row.rank }
    entry.models += 1
    entry.best = Math.min(entry.best, row.rank)
    byOrg.set(row.org, entry)
  }
  return [...byOrg.values()]
    .sort((a, b) => b.models - a.models || a.best - b.best)
    .slice(0, LABS_SHOWN)
    .map(({ org, models }) => ({ org, models }))
}
