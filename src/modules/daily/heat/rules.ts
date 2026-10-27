/**
 * Event heat (docs/specs/daily.md「流程」10, rules after AIHOT): within 48 hours each
 * independent source counts once, its weight halving every 24 hours; comparing with the heat
 * of 6 hours earlier marks the event as rising. Hot-signal sources (Hacker News) count too,
 * weighted by their points. Pure functions: ./heat.ts loads the reports and stores the result.
 */
import type { HeatTrend } from '../story-fields'

export const HEAT_WINDOW_HOURS = 48
export const HEAT_HALF_LIFE_HOURS = 24
export const HEAT_COMPARE_HOURS = 6
/** Hacker News points at which a hot signal weighs double; more points add nothing. */
export const HOT_POINTS_FULL = 500
/** How fast the 0–100 score fills up: one fresh source ≈ 22, five ≈ 71, ten ≈ 92. */
export const HEAT_SCALE = 4
/** Score points an event must gain over 6 hours to be marked as rising. */
export const RISING_MIN = 1

const HOUR_MS = 3_600_000

/** One source's evidence about an event: a report, or a hot source's thread about one. */
export type HeatSignal = {
  /** Counts once per event however many reports it has. */
  sourceId: number
  /** When it appeared: the report's published time, or when we found it. */
  at: Date
  /** When we learned of it; the heat of 6 hours ago only counts what was known then. */
  knownAt: Date
  /** 1 for a report; up to 2 for a hot signal with many points. */
  weight: number
}

/** A signal's weight at `now`: halved every 24 hours, nothing past 48 hours or before it appeared or was known. */
export function contribution(signal: HeatSignal, now: Date): number {
  if (signal.knownAt.getTime() > now.getTime()) return 0
  const age = now.getTime() - signal.at.getTime()
  if (age < 0 || age > HEAT_WINDOW_HOURS * HOUR_MS) return 0
  return signal.weight * 0.5 ** (age / (HEAT_HALF_LIFE_HOURS * HOUR_MS))
}

/** The sum over independent sources at `now`, each counted once with its strongest signal. */
export function rawHeat(signals: readonly HeatSignal[], now: Date): number {
  const best = new Map<number, number>()
  for (const signal of signals) {
    const value = contribution(signal, now)
    if (value > (best.get(signal.sourceId) ?? 0)) best.set(signal.sourceId, value)
  }
  let sum = 0
  for (const value of best.values()) sum += value
  return sum
}

/** The raw sum on a 0–100 scale, one decimal. */
export function heatScore(raw: number): number {
  if (!(raw > 0)) return 0
  return Math.round(1000 * (1 - Math.exp(-raw / HEAT_SCALE))) / 10
}

/** "new" when there was no heat 6 hours ago, "rising" when it gained at least a point since. */
export function trendOf(heat: number, before: number): HeatTrend | null {
  if (!(heat > 0)) return null
  if (!(before > 0)) return 'new'
  return heat - before >= RISING_MIN ? 'rising' : null
}

export type EventHeat = { heat: number; before: number; trend: HeatTrend | null }

/** An event's heat now and 6 hours earlier, and the mark that follows. */
export function eventHeat(signals: readonly HeatSignal[], now: Date): EventHeat {
  const heat = heatScore(rawHeat(signals, now))
  const before = heatScore(rawHeat(signals, new Date(now.getTime() - HEAT_COMPARE_HOURS * HOUR_MS)))
  return { heat, before, trend: trendOf(heat, before) }
}

/** A hot signal's weight: 1, plus up to 1 more as its points reach 500. */
export function hotWeight(points: number | null | undefined): number {
  const capped = Math.min(Math.max(points ?? 0, 0), HOT_POINTS_FULL)
  return 1 + capped / HOT_POINTS_FULL
}

/** When a report appeared: its published time, unless that is missing or later than when we found it. */
export function appearedAt(publishedAt: Date | null, foundAt: Date): Date {
  return publishedAt && publishedAt.getTime() <= foundAt.getTime() ? publishedAt : foundAt
}

/** How far back the heat job looks for events: the window plus the comparison. */
export const HEAT_LOOKBACK_MS = (HEAT_WINDOW_HOURS + HEAT_COMPARE_HOURS) * HOUR_MS

/** A report of an event, as the heat job reads it. */
export type HeatMember = {
  eventId: number
  itemId: number
  relation: 'same' | 'follow_up' | 'roundup'
  sourceId: number
  publishedAt: Date | null
  discoveredAt: Date
  /** Points the report's own source gave it when we stored it (hot_signal sources only). */
  points: number | null
}

/** What a hot_signal source said about a report, kept up to date by every fetch. */
export type HeatThread = { itemId: number; sourceId: number; points: number; postedAt: Date; firstSeenAt: Date }

/**
 * Every event's signals: each report from its source (a hot_signal source's own report
 * weighted by its points), and each hot source's thread about a report. Threads about a
 * roundup are left out: a digest's discussion is not about any one of its stories.
 */
export function signalsOf(
  members: readonly HeatMember[],
  threads: readonly HeatThread[],
  isHotSource: (sourceId: number) => boolean,
): Map<number, HeatSignal[]> {
  const byItem = new Map<number, HeatThread[]>()
  for (const thread of threads) byItem.set(thread.itemId, [...(byItem.get(thread.itemId) ?? []), thread])
  const result = new Map<number, HeatSignal[]>()
  for (const member of members) {
    const list = result.get(member.eventId) ?? []
    const own = byItem.get(member.itemId) ?? []
    const points = Math.max(member.points ?? 0, ...own.filter((thread) => thread.sourceId === member.sourceId).map((thread) => thread.points))
    list.push({
      sourceId: member.sourceId,
      at: appearedAt(member.publishedAt, member.discoveredAt),
      knownAt: member.discoveredAt,
      weight: isHotSource(member.sourceId) ? hotWeight(points) : 1,
    })
    if (member.relation !== 'roundup') {
      for (const thread of own) {
        list.push({
          sourceId: thread.sourceId,
          at: appearedAt(thread.postedAt, thread.firstSeenAt),
          knownAt: thread.firstSeenAt,
          weight: hotWeight(thread.points),
        })
      }
    }
    result.set(member.eventId, list)
  }
  return result
}

/**
 * 传播指数, what the pages show: the highest heat the event has reached, so it never drops, not
 * even after the 48 hours (站长, 2026-10-27). Shown as a whole number in one of four colours.
 */
export function peakOf(peak: number | null | undefined, heat: number): number {
  return Math.max(peak ?? 0, heat)
}

/** Where the colours change: under 40 (one source) green, then orange, red, and from 80 (eight sources or so) magenta. */
export const SPREAD_TIERS = [40, 60, 80] as const

export type SpreadTier = 1 | 2 | 3 | 4

export function spreadTier(value: number): SpreadTier {
  return (1 + SPREAD_TIERS.filter((step) => value >= step).length) as SpreadTier
}

/**
 * The highest heat these signals ever gave the event. Heat only rises when a signal starts to
 * count and decays in between, so the peak is the heat at one of those moments.
 */
export function peakHeat(signals: readonly HeatSignal[]): number {
  let peak = 0
  for (const signal of signals) {
    const at = new Date(Math.max(signal.at.getTime(), signal.knownAt.getTime()))
    peak = Math.max(peak, heatScore(rawHeat(signals, at)))
  }
  return peak
}
