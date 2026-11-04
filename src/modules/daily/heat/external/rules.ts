/**
 * Outside reach checks (docs/specs/daily.md「传播指数」): a news search (Brave) and a search of
 * X (xAI). Each check becomes one heat signal from the time it ran, capped so neither channel
 * alone can fill the index. Pure functions: ./checks.ts runs the searches and stores them.
 */
import type { HeatCheckKind } from '../../schema'
import type { HeatSignal } from '../rules'

const HOUR_MS = 3_600_000

/** Heat-signal source IDs for the two channels; real sources have positive IDs. */
export const CHECK_SOURCE_IDS: Record<HeatCheckKind, number> = { search: -1, x: -2 }

/** Most a check can weigh: a news search up to 1.5 sources, X up to 2 (a busy Hacker News thread). */
export const CHECK_WEIGHT_CAP: Record<HeatCheckKind, number> = { search: 1.5, x: 2 }

/** Outlets at which a news search weighs half its cap. */
export const SEARCH_HALF_OUTLETS = 8
/** Likes plus twice the reposts at which X weighs half its cap. */
export const X_HALF_ENGAGEMENT = 5000

/** Hours between two checks of the same kind for one event. */
export const CHECK_EVERY_HOURS = 12
/** Only stories published in the last 48 hours are checked: older ones have no heat left to add. */
export const CHECK_STORY_HOURS = 48
/** At most this many events per kind in one run. */
export const CHECKS_PER_RUN = 15
/** Default daily caps (Shanghai day), overridden by HEAT_SEARCH_DAILY_LIMIT and HEAT_X_DAILY_LIMIT. */
export const DEFAULT_DAILY_CHECKS: Record<HeatCheckKind, number> = { search: 60, x: 40 }

/** The weight of a check that found `value` (outlets or engagement): rises fast, never past the cap. */
export function checkWeight(kind: HeatCheckKind, value: number): number {
  if (!(value > 0)) return 0
  const half = kind === 'search' ? SEARCH_HALF_OUTLETS : X_HALF_ENGAGEMENT
  return Math.round((CHECK_WEIGHT_CAP[kind] * value) / (value + half) * 1000) / 1000
}

export type StoredCheck = { eventId: number; kind: HeatCheckKind; weight: number; checkedAt: Date }

/** Each check as a heat signal of its channel, from when it ran. */
export function checkSignals(checks: readonly StoredCheck[]): Map<number, HeatSignal[]> {
  const result = new Map<number, HeatSignal[]>()
  for (const check of checks) {
    if (!(check.weight > 0)) continue
    const signal: HeatSignal = { sourceId: CHECK_SOURCE_IDS[check.kind], at: check.checkedAt, knownAt: check.checkedAt, weight: check.weight }
    result.set(check.eventId, [...(result.get(check.eventId) ?? []), signal])
  }
  return result
}

/** A whole number from 0 written in an environment variable, else the fallback. */
const wholeNumber = (raw: string | undefined, fallback: number) => {
  const value = raw?.trim() ? Number(raw) : NaN
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

/** The daily cap for a kind: its environment variable when it is a whole number, else the default. */
export function dailyCheckLimit(kind: HeatCheckKind, env: Record<string, string | undefined> = process.env): number {
  return wholeNumber(env[kind === 'search' ? 'HEAT_SEARCH_DAILY_LIMIT' : 'HEAT_X_DAILY_LIMIT'], DEFAULT_DAILY_CHECKS[kind])
}

/**
 * Catching up on older stories (2026-11-04 站长): the stories published before the last 48 hours,
 * from `HEAT_BACKFILL_SINCE` on, each checked once per channel over the two days after it came
 * out, newest first, a daily share at a time. The check counts from when the story came out, so
 * it adds to the story's reach index like its other sources and never to today's heat.
 */
export const DEFAULT_BACKFILL_SINCE = '2026-01-01'
/** Default daily share of the catching up, overridden by HEAT_SEARCH_BACKFILL_DAILY_LIMIT and HEAT_X_BACKFILL_DAILY_LIMIT. */
export const DEFAULT_BACKFILL_DAILY: Record<HeatCheckKind, number> = { search: 100, x: 50 }
/** Checks per step of the catch-up job, so each step stays well within a function's time. */
export const BACKFILL_STEP = 10
/** The window a catch-up check searches: the story's day and the two after it. */
export const BACKFILL_WINDOW_DAYS = 2

/** The day the catching up starts from: `HEAT_BACKFILL_SINCE` when it is a date, else 2026-01-01. */
export function backfillSince(env: Record<string, string | undefined> = process.env): Date {
  const raw = env.HEAT_BACKFILL_SINCE?.trim()
  const parsed = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : NaN
  return new Date(Number.isNaN(parsed) ? `${DEFAULT_BACKFILL_SINCE}T00:00:00Z` : parsed)
}

/** How many older stories a channel catches up on each day. */
export function backfillDailyLimit(kind: HeatCheckKind, env: Record<string, string | undefined> = process.env): number {
  return wholeNumber(env[kind === 'search' ? 'HEAT_SEARCH_BACKFILL_DAILY_LIMIT' : 'HEAT_X_BACKFILL_DAILY_LIMIT'], DEFAULT_BACKFILL_DAILY[kind])
}

/** The days a catch-up check searches, as YYYY-MM-DD (UTC): the story's day and the two after it. */
export function backfillWindow(publishedAt: Date): { from: string; to: string } {
  const to = new Date(publishedAt.getTime() + BACKFILL_WINDOW_DAYS * 24 * HOUR_MS)
  return { from: publishedAt.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export type BackfillCandidate = { eventId: number; publishedAt: Date }

/**
 * The events to catch up on: published from `since` until 48 hours ago (newer ones get the
 * regular checks), not yet checked by this channel, newest first, one entry per event.
 */
export function backfillDue(
  stories: readonly BackfillCandidate[],
  checked: ReadonlySet<number>,
  since: Date,
  now: Date,
  limit: number,
): BackfillCandidate[] {
  const until = now.getTime() - CHECK_STORY_HOURS * HOUR_MS
  const seen = new Set<number>()
  return [...stories]
    .filter((story) => story.publishedAt.getTime() >= since.getTime() && story.publishedAt.getTime() < until && !checked.has(story.eventId))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.eventId - b.eventId)
    .filter((story) => !seen.has(story.eventId) && Boolean(seen.add(story.eventId)))
    .slice(0, Math.max(0, limit))
}

export type CheckCandidate = { eventId: number; heat: number; lastChecked: Date | null }

/** The events to check now: not checked in the last 12 hours, hottest first, within the run's and the day's room. */
export function dueEvents(candidates: readonly CheckCandidate[], room: number, now: Date): number[] {
  const due = now.getTime() - CHECK_EVERY_HOURS * HOUR_MS
  return candidates
    .filter((candidate) => !candidate.lastChecked || candidate.lastChecked.getTime() <= due)
    .sort((a, b) => b.heat - a.heat || a.eventId - b.eventId)
    .slice(0, Math.max(0, Math.min(room, CHECKS_PER_RUN)))
    .map((candidate) => candidate.eventId)
}

/** What a story is searched by: its English title, and its topic's name to tell matching results apart. */
export type CheckSubject = { eventId: number; title: string; topic: string | null }

const stopWords = new Set(['the', 'and', 'for', 'with', 'its', 'new', 'from', 'into', 'that', 'this', 'now', 'are', 'has', 'have', 'will', 'can', 'more', 'than', 'about', 'after', 'over', 'how', 'what', 'why'])

function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.+-]*/gu) ?? []).filter((word) => word.length >= 3 && !stopWords.has(word))
}

/**
 * Whether a search result is about the story: it names the topic, or (without one) shares at
 * least half the title's words. Loosely related news would otherwise count as reach.
 */
export function matchesStory(subject: CheckSubject, text: string): boolean {
  const haystack = text.toLowerCase()
  if (subject.topic) return haystack.includes(subject.topic.toLowerCase())
  const wanted = [...new Set(words(subject.title))]
  if (!wanted.length) return false
  const found = new Set(words(text))
  return wanted.filter((word) => found.has(word)).length * 2 >= wanted.length
}

export type SearchResult = { url: string; title: string; description: string; hostname?: string | null }

/** An outlet's name for counting: the host without "www.". */
export function outletOf(result: SearchResult): string | null {
  try {
    const host = (result.hostname || new URL(result.url).hostname).toLowerCase()
    return host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** The distinct outlets among the results that are about the story. */
export function searchOutlets(subject: CheckSubject, results: readonly SearchResult[]): string[] {
  const outlets = new Set<string>()
  for (const result of results) {
    if (!matchesStory(subject, `${result.title}\n${result.description}`)) continue
    const outlet = outletOf(result)
    if (outlet) outlets.add(outlet)
  }
  return [...outlets].sort()
}

export type XPost = { url: string; likes: number; reposts: number; views: number }

/** A post's ID from an x.com or twitter.com link; null for anything else. */
export function postId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)(x|twitter)\.com$/i.test(parsed.hostname)) return null
    return parsed.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * The posts the model reported that the search really returned (their links are among xAI's
 * citations), each once, and their engagement: likes plus twice the reposts.
 */
export function verifiedPosts(posts: readonly XPost[], cited: readonly string[]): { posts: XPost[]; engagement: number } {
  const citedIds = new Set(cited.map(postId).filter((id): id is string => id !== null))
  const seen = new Set<string>()
  const kept: XPost[] = []
  for (const post of posts) {
    const id = postId(post.url)
    if (!id || !citedIds.has(id) || seen.has(id)) continue
    seen.add(id)
    kept.push({ url: post.url, likes: Math.max(0, Math.round(post.likes)), reposts: Math.max(0, Math.round(post.reposts)), views: Math.max(0, Math.round(post.views)) })
  }
  return { posts: kept, engagement: kept.reduce((sum, post) => sum + post.likes + 2 * post.reposts, 0) }
}
