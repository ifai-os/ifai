/**
 * Importance and the reach index (docs/specs/daily.md「传播指数」, 2026-11-07 站长): how much an
 * event matters by its kind, combined with how widely it spread (the peak heat). A state-of-the-art
 * model release is worth the full 100; the rest start from their category's base, nudged by the
 * AI score the story got before it was published. Pure functions: the stories collection stores
 * both numbers on every save (`importance`, `spread`).
 */
import type { StoryCategory } from '../categories'

/** What a landmark is worth: everything. The field is `sota` — a state-of-the-art model release, or research that changes a field (2026-11-07 站长). */
export const SOTA_IMPORTANCE = 100

/** Each category's starting importance, most important first (站长 may reorder). */
export const IMPORTANCE_BASE: Record<StoryCategory, number> = {
  llm: 60,
  open: 55,
  industry: 45,
  tools: 40,
  aigc: 40,
  robotics: 35,
  research: 30,
}

/** The AI score that leaves the base as it is; every two points above or below move it by one. */
export const SCORE_NEUTRAL = 70
/** Without SOTA, importance stays within these bounds. */
export const IMPORTANCE_MIN = 20
export const IMPORTANCE_MAX = 95

/** How much of the index importance alone can fill: a SOTA release starts at 60. */
export const IMPORTANCE_SHARE = 0.6

export type ImportanceInput = { category: StoryCategory | null | undefined; score: number | null | undefined; sota: boolean | null | undefined }

/** 0–100: 100 for a SOTA release, else the category's base moved by the AI score (none when it has no score). */
export function importanceOf({ category, score, sota }: ImportanceInput): number {
  if (sota) return SOTA_IMPORTANCE
  const base = IMPORTANCE_BASE[category ?? 'industry'] ?? IMPORTANCE_BASE.industry
  const nudge = typeof score === 'number' && Number.isFinite(score) ? (score - SCORE_NEUTRAL) / 2 : 0
  return Math.round(Math.min(IMPORTANCE_MAX, Math.max(IMPORTANCE_MIN, base + nudge)))
}

/**
 * The index the pages show: importance gives the starting point and reach (the peak heat, 0–100)
 * fills the rest of the way to 100. Never below the reach alone, never above 100; one decimal.
 */
export function spreadIndex(importance: number, reach: number): number {
  const i = Math.min(100, Math.max(0, importance)) / 100
  const r = Math.min(100, Math.max(0, reach)) / 100
  return Math.round(1000 * (1 - (1 - IMPORTANCE_SHARE * i) * (1 - r))) / 10
}
