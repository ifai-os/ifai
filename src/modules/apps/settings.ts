import { shanghaiMidnight } from './metrics/days'

/** Environment settings of the apps pages (docs/setup.md, .env.example). */
type Env = Record<string, string | undefined>

/**
 * APPS_SHOW_TRANCO_RANK: show the Tranco rank on the pages (the「网站排名」column and figures).
 * Off unless "true": the rank always counts toward heat, but is shown only once Tranco's terms
 * are checked (docs/specs/apps.md「已定的规则」8).
 */
export const showTrancoRank = (env: Env = process.env) => env.APPS_SHOW_TRANCO_RANK?.trim().toLowerCase() === 'true'

/**
 * APPS_NEW_SINCE (YYYY-MM-DD, Shanghai): the new board and「本周新上架」leave out apps listed
 * before this day, so the first import does not fill them for a month. Unset: no cut-off.
 */
export function newSince(env: Env = process.env): Date | null {
  const value = env.APPS_NEW_SINCE?.trim() ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const since = shanghaiMidnight(value)
  return Number.isNaN(since.getTime()) ? null : since
}
