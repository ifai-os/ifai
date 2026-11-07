/**
 * Outside reach checks (docs/specs/daily.md「传播指数」): a search of X (xAI's Grok). Each check
 * becomes one heat signal from the time it ran, capped so it alone cannot fill the index. The
 * news search (Brave) is no longer run (2026-11-07 站长); the checks it stored still count.
 * Pure functions: ./checks.ts runs the searches and stores them.
 */
import type { HeatCheckKind } from '../../schema'
import type { HeatSignal } from '../rules'

const HOUR_MS = 3_600_000

/** The channels that still run: X only (2026-11-07 站长: no more Brave). */
export const liveCheckKinds = ['x'] as const satisfies readonly HeatCheckKind[]

/** Heat-signal source IDs for the two channels; real sources have positive IDs. */
export const CHECK_SOURCE_IDS: Record<HeatCheckKind, number> = { search: -1, x: -2 }

/** Most a check can weigh: a news search up to 1.5 sources, X up to 2 (a busy Hacker News thread). */
export const CHECK_WEIGHT_CAP: Record<HeatCheckKind, number> = { search: 1.5, x: 2 }

/** Outlets at which a news search weighs half its cap. */
export const SEARCH_HALF_OUTLETS = 8
/**
 * Views of the most-viewed posts at which X weighs half its cap (2026-11-07 站长: count views
 * only). Checks stored before then measured likes plus twice the reposts and keep their weight.
 */
export const X_HALF_VIEWS = 500_000
/** How many of the most-viewed posts about a story add up to its X views. */
export const X_TOP_POSTS = 5

/**
 * Which stories are worth an outside check (2026-11-07 站长, to spend less): important ones by
 * kind (heat/importance.ts), or ones our own sources already show spreading (two sources or so).
 */
export const CHECK_MIN_IMPORTANCE = 55
export const CHECK_MIN_REACH = 39

/** Only stories published in the last 48 hours are checked: older ones have no heat left to add. */
export const CHECK_STORY_HOURS = 48
/** X is checked once a story is a day old, so every story's views are compared at the same age. */
export const X_CHECK_AFTER_HOURS = 24
/** At most this many events per kind in one run. */
export const CHECKS_PER_RUN = 15
/** Default daily caps (Shanghai day), overridden by HEAT_SEARCH_DAILY_LIMIT and HEAT_X_DAILY_LIMIT. */
export const DEFAULT_DAILY_CHECKS: Record<HeatCheckKind, number> = { search: 60, x: 40 }

/** The weight of a check that found `value` (outlets, or views on X): rises fast, never past the cap. */
export function checkWeight(kind: HeatCheckKind, value: number): number {
  if (!(value > 0)) return 0
  const half = kind === 'search' ? SEARCH_HALF_OUTLETS : X_HALF_VIEWS
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

/** X catches up only on stories from November 2026 on (2026-11-07 站长: no Grok for older ones). */
export const X_BACKFILL_SINCE = '2026-11-01'

/**
 * The day the catching up starts from: `HEAT_BACKFILL_SINCE` when it is a date, else 2026-01-01;
 * for X never before 2026-11-01.
 */
export function backfillSince(env: Record<string, string | undefined> = process.env, kind: HeatCheckKind = 'search'): Date {
  const raw = env.HEAT_BACKFILL_SINCE?.trim()
  const parsed = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : NaN
  const since = Number.isNaN(parsed) ? Date.parse(`${DEFAULT_BACKFILL_SINCE}T00:00:00Z`) : parsed
  return new Date(kind === 'x' ? Math.max(since, Date.parse(`${X_BACKFILL_SINCE}T00:00:00Z`)) : since)
}

export type Worth = { importance: number | null | undefined; reach: number | null | undefined }

/** Whether a story is worth an outside check: important enough, or already spreading. */
export function worthChecking({ importance, reach }: Worth): boolean {
  return (importance ?? 0) >= CHECK_MIN_IMPORTANCE || (reach ?? 0) >= CHECK_MIN_REACH
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

export type BackfillCandidate = { eventId: number; publishedAt: Date } & Worth

/**
 * The events to catch up on: published from `since` until 48 hours ago (newer ones get the
 * regular checks), worth checking and not yet checked by this channel, newest first, one entry per event.
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
    .filter((story) => story.publishedAt.getTime() >= since.getTime() && story.publishedAt.getTime() < until && !checked.has(story.eventId) && worthChecking(story))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.eventId - b.eventId)
    .filter((story) => !seen.has(story.eventId) && Boolean(seen.add(story.eventId)))
    .slice(0, Math.max(0, limit))
}

export type CheckCandidate = { eventId: number; heat: number; checked: boolean; publishedAt: Date } & Worth

/**
 * The events to check now, each once per channel (2026-11-07 站长): worth checking and not
 * checked yet; for X only once the story is a day old. Hottest first, within the run's and the day's room.
 */
export function dueEvents(kind: HeatCheckKind, candidates: readonly CheckCandidate[], room: number, now: Date): number[] {
  const oldEnough = now.getTime() - (kind === 'x' ? X_CHECK_AFTER_HOURS : 0) * HOUR_MS
  return candidates
    .filter((candidate) => !candidate.checked && worthChecking(candidate) && candidate.publishedAt.getTime() <= oldEnough)
    .sort((a, b) => b.heat - a.heat || a.eventId - b.eventId)
    .slice(0, Math.max(0, Math.min(room, CHECKS_PER_RUN)))
    .map((candidate) => candidate.eventId)
}

/** What a story is searched by: its English title and its topic's name. */
export type CheckSubject = { eventId: number; title: string; topic: string | null }

export type XPost = { url: string; views: number }

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
 * citations), each once, with a view count the search showed; the five most viewed and their views together.
 */
export function verifiedPosts(posts: readonly XPost[], cited: readonly string[]): { posts: XPost[]; views: number } {
  const citedIds = new Set(cited.map(postId).filter((id): id is string => id !== null))
  const seen = new Set<string>()
  const kept: XPost[] = []
  for (const post of posts) {
    const id = postId(post.url)
    const views = Math.max(0, Math.round(post.views))
    if (!id || !citedIds.has(id) || seen.has(id) || !(views > 0)) continue
    seen.add(id)
    kept.push({ url: post.url, views })
  }
  const top = kept.sort((a, b) => b.views - a.views).slice(0, X_TOP_POSTS)
  return { posts: top, views: top.reduce((sum, post) => sum + post.views, 0) }
}
