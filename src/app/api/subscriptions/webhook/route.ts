import { NextResponse, type NextRequest } from 'next/server'

import { handleDeliveryEvent, readDeliveryEvent, verifyWebhook } from '@/modules/daily/email/webhook'

export const dynamic = 'force-dynamic'

/** Resend's events are a few kilobytes; anything far larger is not one. */
const MAX_BODY = 256 * 1024

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/**
 * POST /api/subscriptions/webhook — Resend's delivery events (docs/specs/daily-email.md「页面与
 * 路由」), signed with RESEND_WEBHOOK_SECRET. A 2xx tells Resend the event arrived; anything else
 * makes it try again later.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return reply({ error: 'not-configured' }, 503)
  const body = await request.text()
  if (body.length > MAX_BODY) return reply({ error: 'too-large' }, 413)

  const now = new Date()
  const headers = {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  }
  if (!verifyWebhook(secret, headers, body, now)) return reply({ error: 'bad-signature' }, 401)

  let parsed: unknown = null
  try {
    parsed = JSON.parse(body)
  } catch {
    return reply({ error: 'invalid-json' }, 400)
  }
  const event = readDeliveryEvent(parsed)
  if (!event) return reply({ result: 'ignored' })
  return reply({ result: await handleDeliveryEvent(headers.id!, event, now) })
}
