import { createHmac } from 'node:crypto'

/**
 * Counting visitors without keeping who they are: a hash of IP + user agent under a salt that
 * is derived from the day, so the same visitor counts once a day and hashes from different
 * days cannot be linked. Raw IPs are never stored. Used by app clicks (`app_clicks`); Skill
 * installs (`skill_events`) follow the same rule.
 */
export function visitorHash({ ip, userAgent, day, secret }: { ip: string; userAgent: string; day: string; secret: string }): string {
  const salt = createHmac('sha256', secret).update(`visitor-salt:${day}`).digest()
  return createHmac('sha256', salt).update(`${ip}\n${userAgent}`).digest('base64url').slice(0, 32)
}

/** The visitor's address as Vercel (or the proxy in front of the site) reports it; '' when unknown. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || ''
}

/**
 * Whether a request is a person opening something: a GET with a user agent that is not a
 * known bot (`isBot` from next/server's userAgent()) and not a browser prefetch.
 */
export function isCountedVisit(request: Request, isBot: boolean): boolean {
  if (request.method !== 'GET' || isBot) return false
  const headers = request.headers
  if (!headers.get('user-agent')?.trim()) return false
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''}`.toLowerCase()
  if (purpose.includes('prefetch') || purpose.includes('prerender')) return false
  return !headers.has('next-router-prefetch')
}
