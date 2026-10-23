/**
 * The daily poster's rules (docs/specs/daily.md「流程」11, the「今日海报」column of the
 * 「日报审核后台」board): the stories published on one Shanghai calendar day, one per event,
 * most important first, at most two from the same source, eight at most. Pure, so the review
 * screen checks an addition the same way the server does; ./desk.ts loads and saves.
 */
import { shanghaiDate } from '@/lib/shanghai-day'

export const POSTER_MAX = 8
export const SAME_SOURCE_MAX = 2

const DAY_MS = 24 * 3_600_000

export type PosterCandidate = {
  id: number
  eventId: number
  heat: number
  score: number | null
  publishedAt: string
  /** Publisher of the original announcement (or of the first report): what "the same source" counts. */
  source: string | null
}

/** A YYYY-MM-DD calendar date that exists. */
export function isPosterDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const noon = Date.parse(`${value}T12:00:00+08:00`)
  return Number.isFinite(noon) && shanghaiDate(new Date(noon)) === value
}

/** 00:00 to 24:00 Shanghai time of a poster date. */
export function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+08:00`)
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

/** The day before or after, as YYYY-MM-DD. */
export function shiftDate(date: string, days: number): string {
  return shanghaiDate(new Date(Date.parse(`${date}T12:00:00+08:00`) + days * DAY_MS))
}

function sourceKey(source: string | null): string | null {
  const key = source?.trim().toLowerCase()
  return key || null
}

/** How many of `items` other than `candidate` come from its source. */
export function sameSourceCount(items: readonly number[], candidate: PosterCandidate, byId: ReadonlyMap<number, PosterCandidate>): number {
  const key = sourceKey(candidate.source)
  if (!key) return 0
  return items.filter((id) => id !== candidate.id && sourceKey(byId.get(id)?.source ?? null) === key).length
}

/** Most important first: the event's heat, then the AI score, then the newer story. */
export function byImportance(a: PosterCandidate, b: PosterCandidate): number {
  return b.heat - a.heat || (b.score ?? 0) - (a.score ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.id - a.id
}

/** The automatic choice: by importance, one story per event, at most two per source, eight at most. */
export function autoPick(candidates: readonly PosterCandidate[]): number[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const events = new Set<number>()
  const items: number[] = []
  for (const candidate of [...candidates].sort(byImportance)) {
    if (items.length === POSTER_MAX) break
    if (events.has(candidate.eventId) || sameSourceCount(items, candidate, byId) >= SAME_SOURCE_MAX) continue
    events.add(candidate.eventId)
    items.push(candidate.id)
  }
  return items
}

export type AddCheck = 'ok' | 'present' | 'full' | 'same_source' | 'same_event'

/**
 * Whether a story can join the poster, by the editor's「加入」or on being published: there is
 * room, its event is not on it yet and its source has fewer than two on it.
 */
export function addCheck(items: readonly number[], candidate: PosterCandidate, byId: ReadonlyMap<number, PosterCandidate>): AddCheck {
  if (items.includes(candidate.id)) return 'present'
  if (items.length >= POSTER_MAX) return 'full'
  if (items.some((id) => byId.get(id)?.eventId === candidate.eventId)) return 'same_event'
  if (sameSourceCount(items, candidate, byId) >= SAME_SOURCE_MAX) return 'same_source'
  return 'ok'
}

export type ArrangementProblem = 'unknown' | 'duplicate' | 'too_many' | 'same_event' | 'same_source'

/** What is wrong with an arrangement the editor sent, or null: stories of that day, each once, within the limits. */
export function arrangementProblem(items: readonly number[], byId: ReadonlyMap<number, PosterCandidate>): ArrangementProblem | null {
  if (items.some((id) => !byId.has(id))) return 'unknown'
  if (new Set(items).size !== items.length) return 'duplicate'
  if (items.length > POSTER_MAX) return 'too_many'
  if (new Set(items.map((id) => byId.get(id)!.eventId)).size !== items.length) return 'same_event'
  if (items.some((id) => sameSourceCount(items, byId.get(id)!, byId) >= SAME_SOURCE_MAX)) return 'same_source'
  return null
}

/**
 * Where the poster stands: nothing on it; not generated yet; the images show the current
 * list; or the list changed (order, stories, a correction) since the images were made.
 */
export type PosterState = 'empty' | 'idle' | 'generated' | 'stale'

export function posterState({
  items,
  shown,
  generatedAt,
  correctedAt,
}: {
  items: readonly number[]
  /** The stories in the generated images, in order; null before the first generation. */
  shown: readonly number[] | null
  generatedAt: string | null
  correctedAt: ReadonlyMap<number, string | null>
}): PosterState {
  if (!items.length) return 'empty'
  if (!shown || !generatedAt) return 'idle'
  const generated = Date.parse(generatedAt)
  const sameList = items.length === shown.length && items.every((id, index) => shown[index] === id)
  const corrected = items.some((id) => {
    const at = correctedAt.get(id)
    return at ? Date.parse(at) > generated : false
  })
  return sameList && !corrected ? 'generated' : 'stale'
}
