/**
 * What members can save, and the small rules shared by the saves route and the save button.
 * No server imports: the button uses this file too.
 */

/** Apps and Skills now; daily stories later (adding a type here needs no new table or migration). */
export const saveTypes = ['app', 'skill'] as const
export type SaveType = (typeof saveTypes)[number]

/** A thing to save: its type and its Payload id in that type's collection. */
export type SaveTarget = { type: SaveType; id: number }

const maxId = 2 ** 31 - 1

/** A target from a request's type and id (a query string or JSON body); null when either is not valid. */
export function parseSaveTarget(type: unknown, id: unknown): SaveTarget | null {
  if (typeof type !== 'string' || !(saveTypes as readonly string[]).includes(type)) return null
  const value = typeof id === 'string' && /^[1-9]\d{0,9}$/.test(id) ? Number(id) : id
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maxId) return null
  return { type: type as SaveType, id: value }
}

/**
 * Signing in from a save button comes back to the same page with ?save=app-12, and the page then
 * finishes the save (the「需要登录」board: back where you were, with the action done).
 */
export const pendingSaveParam = 'save'

export function pendingSaveValue({ type, id }: SaveTarget): string {
  return `${type}-${id}`
}

export function readPendingSave(value: string | null): SaveTarget | null {
  const match = value?.match(/^([a-z]+)-(\d+)$/)
  return match ? parseSaveTarget(match[1], match[2]) : null
}

/**
 * Whether a request comes from another site's page. Browsers say so in Sec-Fetch-Site; older ones
 * only send Origin. Requests without either (not from a browser page) are left to the session check.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site) return site !== 'same-origin'
  const origin = request.headers.get('origin')
  return origin !== null && origin !== new URL(request.url).origin
}
