import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The token in every manage and unsubscribe link (docs/specs/daily-email.md「数据」):
 * "<subscriber id>.<signature>", signed with a key derived from PAYLOAD_SECRET. Nothing is
 * stored, so a token works as long as the subscription exists and the secret stays the same.
 * Kept free of app imports: the smoke tests sign tokens with it too.
 */
const SIGNATURE_LENGTH = 32

function signature(id: number, secret: string): string {
  const key = createHmac('sha256', secret).update('daily-email:subscriber-token').digest()
  return createHmac('sha256', key).update(`subscriber:${id}`).digest('base64url').slice(0, SIGNATURE_LENGTH)
}

export function subscriberToken(id: number, secret: string): string {
  if (!secret) throw new Error('PAYLOAD_SECRET is not set: subscription links cannot be signed.')
  return `${id}.${signature(id, secret)}`
}

/** The subscriber id a token was signed for, or null for anything else. */
export function subscriberIdOf(token: unknown, secret: string): number | null {
  if (!secret || typeof token !== 'string') return null
  const match = /^([1-9]\d{0,11})\.([A-Za-z0-9_-]+)$/.exec(token)
  if (!match) return null
  const id = Number(match[1])
  const expected = Buffer.from(signature(id, secret))
  const given = Buffer.from(match[2])
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}
