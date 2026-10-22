/**
 * Master switches for the daily pipeline (docs/specs/daily.md). Both are off unless set to
 * "true", so a fresh environment never collects or spends money by accident.
 */
type Env = Record<string, string | undefined>

const on = (value: string | undefined) => value?.trim().toLowerCase() === 'true'

/** COLLECT_ENABLED: scheduled source fetching. */
export const collectEnabled = (env: Env = process.env) => on(env.COLLECT_ENABLED)

/** MODEL_CALLS_ENABLED: every paid model call made through src/lib/ai. */
export const modelCallsEnabled = (env: Env = process.env) => on(env.MODEL_CALLS_ENABLED)
