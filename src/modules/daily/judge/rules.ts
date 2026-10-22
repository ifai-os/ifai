import type { SourceTier } from '../types'

/**
 * Score thresholds by source tier (docs/specs/daily.md「流程」, AIHOT's starting values).
 * The owner recalibrates them from review results; DAILY_SCORE_THRESHOLD_<TIER> overrides one
 * without a deploy.
 */
export const defaultThresholds: Record<SourceTier, number> = { T1: 60, T1_5: 65, T2: 76 }

export function thresholdFor(tier: SourceTier, env: Record<string, string | undefined> = process.env): number {
  const value = Number(env[`DAILY_SCORE_THRESHOLD_${tier}`])
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : defaultThresholds[tier]
}

/** Two scores this far apart get the「两次评分差距大」flag in the queue. */
export const SCORE_GAP_FLAG = 20

export type ScoreVerdict = { average: number; passed: boolean; gap: number }

export function scoreVerdict(a: number, b: number, threshold: number): ScoreVerdict {
  const average = (a + b) / 2
  return { average, passed: average >= threshold, gap: Math.abs(a - b) }
}

/** Grouping: how far back to look for related reports, and how similar they must be. */
export const GROUP_WINDOW_DAYS = 14
export const GROUP_CANDIDATES = 5
export const SIMILARITY_MIN = 0.75

/** Flags shown on queue cards, from the judging steps. The rest come at review time. */
export type AnalysisFlag = 'promotional' | 'tutorial' | 'score_gap'
