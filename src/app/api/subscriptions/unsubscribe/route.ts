import { NextResponse, type NextRequest } from 'next/server'

import { defaultLocale } from '@/i18n/config'
import { managePath } from '@/modules/daily/email/links'
import { manage, subscriberForToken } from '@/modules/daily/email/manage'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/subscriptions/unsubscribe?token=… — the address in the List-Unsubscribe header, which
 * mail clients call when the reader presses their own「退订」button (RFC 8058 one-click):
 * 200 and an empty body. No same-site check: the request comes from the mail provider's servers.
 */
export async function POST(request: NextRequest) {
  const subscriber = await subscriberForToken(request.nextUrl.searchParams.get('token'))
  if (!subscriber) return new Response(null, { status: 404, headers: noStore })
  await manage(subscriber, { type: 'unsubscribe' }, new Date())
  return new Response(null, { status: 200, headers: noStore })
}

/** A client that opens the address in a browser instead gets the manage page, which unsubscribes as it opens. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const subscriber = await subscriberForToken(token)
  const target = new URL(managePath(subscriber?.locale ?? defaultLocale), request.nextUrl.origin)
  target.searchParams.set('token', token)
  target.searchParams.set('unsubscribe', '1')
  return NextResponse.redirect(target, { status: 303, headers: noStore })
}
