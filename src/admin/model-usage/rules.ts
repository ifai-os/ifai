/**
 * The back office's model usage page (docs/specs/foundation.md「后台 · 模型用量」): the pure
 * parts, so they can be tested without a database. Days are Shanghai calendar days, the same
 * days the daily budget counts.
 */
import { shanghaiDate } from '@/lib/shanghai-day'
import { contestPurposes, embeddingPurposes, modelFor, textPurposes, type ContestPurpose, type Purpose } from '@/lib/ai/purposes'

type Env = Record<string, string | undefined>

/** The「按用途」periods in days: today, the last 7 days, the last 30 days. */
export const periods = [1, 7, 30] as const
export type Period = (typeof periods)[number]
export const DEFAULT_PERIOD: Period = 7

/** ?days= → a known period, otherwise the default. */
export function periodFrom(value: unknown): Period {
  const raw = Array.isArray(value) ? value[0] : value
  const days = Number(raw)
  return (periods as readonly number[]).includes(days) ? (days as Period) : DEFAULT_PERIOD
}

/** How many days the「近 14 天」table shows. */
export const DAY_ROWS = 14
/** How far back failed calls are listed. */
export const PROBLEM_DAYS = 30
/** At most this many calls are listed under「要处理的调用」. */
export const PROBLEM_LIMIT = 30

export type Module = 'daily' | 'apps' | 'resources' | 'rankings'

/** Which module calls each purpose (src/lib/ai/purposes.ts). */
export const purposeModules: Record<Purpose | ContestPurpose, Module> = {
  prefilter: 'daily',
  score: 'daily',
  structure: 'daily',
  group: 'daily',
  write: 'daily',
  assist: 'daily',
  embed: 'daily',
  profile: 'apps',
  translate: 'apps',
  describe: 'resources',
  arena: 'rankings',
}

const defaultModels: Record<Purpose, string> = { ...textPurposes, ...embeddingPurposes }
const knownPurposes = Object.keys(purposeModules) as (Purpose | ContestPurpose)[]
const isKnown = (purpose: string): purpose is Purpose | ContestPurpose => Object.hasOwn(purposeModules, purpose)
/** A purpose whose model comes with each call (the arena's contestants), so it has no model of its own to show. */
export const isContestPurpose = (purpose: string): purpose is ContestPurpose => (contestPurposes as readonly string[]).includes(purpose)

/** The Shanghai date `days` days before `now`'s Shanghai date. */
function dateBefore(now: Date, days: number): string {
  const noon = new Date(`${shanghaiDate(now)}T12:00:00+08:00`)
  return shanghaiDate(new Date(noon.getTime() - days * 24 * 60 * 60 * 1000))
}

export type DayTotals = { date: string; succeeded: number; failed: number; costUsd: number }

/** The last `count` Shanghai days, newest first, with zeros for days without calls. */
export function lastDays(rows: DayTotals[], now: Date, count: number = DAY_ROWS): DayTotals[] {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return Array.from({ length: count }, (_, back) => {
    const date = dateBefore(now, back)
    return byDate.get(date) ?? { date, succeeded: 0, failed: 0, costUsd: 0 }
  })
}

export function sumDays(days: DayTotals[]): Omit<DayTotals, 'date'> {
  return days.reduce(
    (sum, day) => ({ succeeded: sum.succeeded + day.succeeded, failed: sum.failed + day.failed, costUsd: sum.costUsd + day.costUsd }),
    { succeeded: 0, failed: 0, costUsd: 0 },
  )
}

export type PurposeTotals = {
  purpose: string
  succeeded: number
  failed: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type PurposeRow = PurposeTotals & {
  /** null for a purpose that is no longer in purposes.ts but still has receipts. */
  module: Module | null
  /** The model the purpose uses now; null for an unknown purpose and for a contest purpose (one model per contestant). */
  model: string | null
  /** AI_MODEL_<PURPOSE> points it away from the default. */
  changed: boolean
  /** Cost per successful call; null when nothing succeeded. */
  averageUsd: number | null
}

/**
 * One row per purpose in purposes.ts order, including purposes without calls in the period,
 * then any other purposes the receipts mention.
 */
export function purposeRows(totals: PurposeTotals[], env: Env = process.env): PurposeRow[] {
  const byPurpose = new Map(totals.map((row) => [row.purpose, row]))
  const empty = (purpose: string): PurposeTotals => ({ purpose, succeeded: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
  const others = totals.map((row) => row.purpose).filter((purpose) => !isKnown(purpose)).sort()
  return [...knownPurposes, ...others].map((purpose) => {
    const row = byPurpose.get(purpose) ?? empty(purpose)
    const averageUsd = row.succeeded > 0 ? row.costUsd / row.succeeded : null
    if (!isKnown(purpose)) return { ...row, module: null, model: null, changed: false, averageUsd }
    if (isContestPurpose(purpose)) return { ...row, module: purposeModules[purpose], model: null, changed: false, averageUsd }
    const model = modelFor(purpose, env)
    return { ...row, module: purposeModules[purpose], model, changed: model !== defaultModels[purpose], averageUsd }
  })
}

export type Budget = { spentUsd: number; budgetUsd: number; leftUsd: number; ratio: number; usedUp: boolean }

/** Today's spend against the daily budget; the call guard stops at spent ≥ budget. */
export function budgetOf(spentUsd: number, budgetUsd: number): Budget {
  return {
    spentUsd,
    budgetUsd,
    leftUsd: Math.max(0, budgetUsd - spentUsd),
    ratio: budgetUsd > 0 ? Math.min(1, spentUsd / budgetUsd) : 1,
    usedUp: spentUsd >= budgetUsd,
  }
}

export type SubjectKind = 'stories' | 'raw_items' | 'apps' | 'app_reviews' | 'skill-versions' | 'arena-answers'
export type Subject = { kind: SubjectKind; id: number }
const subjectKinds: readonly string[] = [
  'stories',
  'raw_items',
  'apps',
  'app_reviews',
  'skill-versions',
  'arena-answers',
] satisfies SubjectKind[]

/**
 * What a receipt was about: "stories:12", "stories:12:shorten", "raw_items:5", "apps:3",
 * "app_reviews:9", "skill-versions:4", "arena-answers:7". Anything else is shown as written.
 */
export function parseSubject(subject: string | null): Subject | null {
  const match = subject?.match(/^([a-z_-]+):(\d+)(?::.*)?$/)
  if (!match || !subjectKinds.includes(match[1])) return null
  const id = Number(match[2])
  return Number.isSafeInteger(id) && id > 0 ? { kind: match[1] as SubjectKind, id } : null
}

/** The first `length` characters of an error, on one line. */
export function shortError(error: string | null, length = 300): string {
  const line = (error ?? '').replace(/\s+/g, ' ').trim()
  return line.length > length ? `${line.slice(0, length - 1)}…` : line
}
