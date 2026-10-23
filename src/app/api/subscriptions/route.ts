import { after, NextResponse, type NextRequest } from 'next/server'

import { dayKey, serverTimeZone } from '@/lib/local-time'
import { isCrossSite } from '@/lib/same-origin'
import { clientIp, visitorHash } from '@/lib/visitor'
import { domainOf, isEmailAddress } from '@/modules/daily/email/address'
import { subscribingOpen } from '@/modules/daily/email/delivery'
import { domainTakesMail } from '@/modules/daily/email/mail-domain'
import { readSubscribeRequest } from '@/modules/daily/email/rules'
import { attemptAllowed, sendWelcome, subscribe } from '@/modules/daily/email/subscribe'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * POST /api/subscriptions { email, locale, timeZone, page, website } → { ok: true }, from the
 * subscribe boxes (docs/specs/daily-email.md). Any deliverable address gets the same answer,
 * whether it was new, already subscribed or stopped (rule 4); the welcome email, when one is
 * due, goes out after the response.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  if (!subscribingOpen()) return reply({ error: 'closed' }, 404)
  const input = readSubscribeRequest(await request.json().catch(() => null))
  if (!input) return reply({ error: 'invalid-request' }, 400)
  if (input.robot) return reply({ ok: true })

  const now = new Date()
  const visitor = visitorHash({
    ip: clientIp(request.headers),
    userAgent: request.headers.get('user-agent') ?? '',
    day: dayKey(now, serverTimeZone),
    secret: process.env.PAYLOAD_SECRET ?? '',
  })
  if (!(await attemptAllowed(visitor, now))) return reply({ error: 'too-many' }, 429)

  if (!isEmailAddress(input.email) || (await domainTakesMail(domainOf(input.email))) === 'no-mail') {
    return reply({ error: 'invalid-email' }, 400)
  }
  const welcome = await subscribe(input, now)
  if (welcome) after(() => sendWelcome(welcome, now))
  return reply({ ok: true })
}
