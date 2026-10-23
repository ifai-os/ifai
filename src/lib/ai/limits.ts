/**
 * Limits on paid model calls, shared by the client (src/lib/ai/client.ts) and the back office's
 * model usage page (src/admin/model-usage/), which reads them without loading the model SDK.
 */
type Env = Record<string, string | undefined>

/** Default daily budget in US dollars (Shanghai day), matching the review dashboard. */
export const DEFAULT_DAILY_BUDGET_USD = 10
/** A pending receipt older than this is treated as a crashed run and may be retried. */
export const STALE_AFTER_MS = 10 * 60 * 1000
/** A call that keeps failing stops after this many paid attempts and waits for a person. */
export const MAX_ATTEMPTS = 3

/** AI_DAILY_BUDGET_USD when it is a number ≥ 0, otherwise the default. */
export function dailyBudgetUsd(env: Env = process.env): number {
  const value = Number(env.AI_DAILY_BUDGET_USD)
  return env.AI_DAILY_BUDGET_USD?.trim() && Number.isFinite(value) && value >= 0 ? value : DEFAULT_DAILY_BUDGET_USD
}
