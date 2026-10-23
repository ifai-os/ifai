/**
 * Master switches for the daily pipeline (docs/specs/daily.md) and its email
 * (docs/specs/daily-email.md). All are off unless set to "true", so a fresh environment never
 * collects, spends money or emails anyone by accident.
 */
type Env = Record<string, string | undefined>

const on = (value: string | undefined) => value?.trim().toLowerCase() === 'true'

/** COLLECT_ENABLED: scheduled source fetching. */
export const collectEnabled = (env: Env = process.env) => on(env.COLLECT_ENABLED)

/** MODEL_CALLS_ENABLED: every paid model call made through src/lib/ai. */
export const modelCallsEnabled = (env: Env = process.env) => on(env.MODEL_CALLS_ENABLED)

/** DAILY_EMAIL_ENABLED: the daily email: the subscribe boxes, new subscriptions and the morning send. */
export const dailyEmailEnabled = (env: Env = process.env) => on(env.DAILY_EMAIL_ENABLED)
