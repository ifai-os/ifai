import { cleanName } from '@/modules/apps/reviews/rules'

/**
 * The nickname as `/api/auth/update-user` takes it (docs/specs/account.md): reviews show it, and so
 * will circles. Cleaned like the name on a review (one line, no invisible characters, at most
 * `reviewRules.maxName`), and never empty, however the request was made.
 *
 * Returns the body with its name cleaned, 'empty' when the name cleans to nothing, and null when
 * the body changes no name (the interface language, say).
 */
export function withCleanName(body: unknown): Record<string, unknown> | 'empty' | null {
  if (!body || typeof body !== 'object' || !('name' in body)) return null
  const name = typeof body.name === 'string' ? cleanName(body.name) : ''
  return name ? { ...body, name } : 'empty'
}
