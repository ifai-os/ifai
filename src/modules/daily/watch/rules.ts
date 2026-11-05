/**
 * The daily's「断更告警」(docs/specs/daily.md): when nothing new has gone on the site for a while,
 * the site owner (every back-office admin) gets an email. Pure rules here, the job in ./jobs.ts.
 */

type Env = Record<string, string | undefined>

const HOUR = 60 * 60 * 1000

/** How often the check runs (its cron in ./jobs.ts); each quiet spell is reported once per window. */
export const CHECK_EVERY_HOURS = 3

/** Hours without a newly published story before the first alert. DAILY_STALE_ALERT_HOURS, default 12. */
export function staleAfterHours(env: Env = process.env): number {
  const value = Number(env.DAILY_STALE_ALERT_HOURS)
  return Number.isFinite(value) && value >= CHECK_EVERY_HOURS ? value : 12
}

/**
 * Only production alerts by default: the previews' databases go quiet all the time. DAILY_STALE_ALERT
 * = "on" turns it on elsewhere (to try it), "off" turns it off everywhere.
 */
export function staleAlertsOn(env: Env = process.env): boolean {
  const flag = env.DAILY_STALE_ALERT?.trim().toLowerCase()
  if (flag === 'off') return false
  if (flag === 'on') return true
  return env.VERCEL_ENV === 'production'
}

/**
 * Whether this run should send an alert. Stateless, so a retry or a skipped run never sends twice:
 * the first alert goes in the run that falls in [after, after + 3h) of quiet, then one a day
 * ([after + 24h, after + 27h) …) until something is published again. A site with no story at
 * all is not "stale", it has not started.
 */
export function shouldAlert(lastPublished: Date | null, now: Date, afterHours: number): boolean {
  if (!lastPublished) return false
  const quiet = now.getTime() - lastPublished.getTime()
  const past = quiet - afterHours * HOUR
  if (past < 0) return false
  return past % (24 * HOUR) < CHECK_EVERY_HOURS * HOUR
}

/** Whole hours of quiet, for the email. */
export function quietHours(lastPublished: Date, now: Date): number {
  return Math.floor((now.getTime() - lastPublished.getTime()) / HOUR)
}
