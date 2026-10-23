import { NextResponse, type NextRequest } from 'next/server'

import { isCrossSite } from '@/lib/same-origin'
import { subscribingOpen } from '@/modules/daily/email/delivery'
import { manage, subscriberForToken } from '@/modules/daily/email/manage'
import { readManageRequest } from '@/modules/daily/email/rules'
import { subscriptionView } from '@/modules/daily/email/view'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/**
 * POST /api/subscriptions/manage { token, pageLocale, action: update | unsubscribe | resubscribe,
 * locale?, timeZone? } → the subscription as the manage page shows it. The token from the email
 * is the only key: no sign-in.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return reply({ error: 'cross-site' }, 403)
  const input = readManageRequest(await request.json().catch(() => null))
  if (!input) return reply({ error: 'invalid-request' }, 400)
  const subscriber = await subscriberForToken(input.token)
  if (!subscriber) return reply({ error: 'invalid-token' }, 404)
  const now = new Date()
  const result = await manage(subscriber, input.action, now)
  if (result === 'forbidden') return reply({ error: 'stopped' }, 403)
  return reply(subscriptionView(result, input.pageLocale, now, subscribingOpen()))
}
