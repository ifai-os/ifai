import { createHmac, timingSafeEqual } from 'node:crypto'

import { and, eq, inArray, isNull, or, sql } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'
import type { Subscriber } from '@/payload-types'

import type { StopReason } from '../collections/subscribers'
import { deploymentEnv } from './delivery'
import { emailEvents, emailSends, type EmailSendStatus } from './schema'

/**
 * Resend's delivery webhooks (docs/specs/daily-email.md rule 8): delivered, bounced and marked
 * as spam, for the welcome and the morning emails this deployment sent. A permanent bounce or a
 * complaint stops the address at once. Resend may deliver an event twice: each is handled once,
 * by its svix-id.
 */

/** Svix, which signs Resend's webhooks, rejects signatures older or newer than five minutes. */
const TOLERANCE_S = 5 * 60

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null }

/**
 * Whether the request is Resend's: HMAC-SHA256 of "id.timestamp.body" with the secret (the
 * base64 after `whsec_`), matching one of the "v1,<base64>" entries, sent within five minutes.
 */
export function verifyWebhook(secret: string, headers: WebhookHeaders, body: string, now: Date): boolean {
  const { id, timestamp, signature } = headers
  if (!secret || !id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > TOLERANCE_S) return false
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  return signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) return false
    const given = Buffer.from(value, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

export type DeliveryEvent = {
  /** email.delivered, email.bounced, email.complained … */
  type: string
  emailId: string | null
  to: string | null
  /** When Resend took the email. */
  sentAt: string | null
  tags: Record<string, string>
  /** Permanent, Temporary … */
  bounceType: string | null
  /** Resend's words: why it bounced, failed or was suppressed. */
  detail: string | null
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** The parts of a webhook body this module uses, or null when it is not an email event. */
export function readDeliveryEvent(body: unknown): DeliveryEvent | null {
  if (!body || typeof body !== 'object') return null
  const { type, data } = body as { type?: unknown; data?: unknown }
  if (typeof type !== 'string' || !type.startsWith('email.') || !data || typeof data !== 'object') return null
  const fields = data as Record<string, unknown>
  const tags: Record<string, string> = {}
  // An object of name → value; the array of { name, value } the API takes is read too.
  const rawTags = fields.tags
  if (Array.isArray(rawTags)) {
    for (const tag of rawTags as { name?: unknown; value?: unknown }[]) if (typeof tag?.name === 'string' && typeof tag.value === 'string') tags[tag.name] = tag.value
  } else if (rawTags && typeof rawTags === 'object') {
    for (const [name, value] of Object.entries(rawTags)) if (typeof value === 'string') tags[name] = value
  }
  const bounce = (fields.bounce ?? {}) as Record<string, unknown>
  const failed = (fields.failed ?? {}) as Record<string, unknown>
  const suppressed = (fields.suppressed ?? {}) as Record<string, unknown>
  return {
    type,
    emailId: text(fields.email_id),
    to: Array.isArray(fields.to) ? text(fields.to[0]) : text(fields.to),
    sentAt: text(fields.created_at),
    tags,
    bounceType: text(bounce.type),
    detail: text(bounce.message) ?? text(failed.reason) ?? text(suppressed.message),
  }
}

export type EventPlan = {
  /** Who the email went to, by its tags: the event changes nothing unless the address is theirs. */
  subscriberId: number
  /** The morning email's row: its new status, from which statuses (never back), and Resend's words. */
  send: { id: number; status: EmailSendStatus; from: EmailSendStatus[]; error: string | null; refund: boolean } | null
  /** Stop writing to the subscriber. */
  stop: Exclude<StopReason, 'owner'> | null
}

const idOf = (value: string | undefined) => (value && /^[1-9]\d{0,11}$/.test(value) ? Number(value) : null)

/**
 * What an event changes, or null when it is not one of ours: another deployment's email
 * (production and preview share the Resend account), the sign-in or submission emails, or a
 * test email from the back office.
 */
export function planEvent(event: DeliveryEvent, env: string): EventPlan | null {
  const { kind } = event.tags
  const subscriberId = idOf(event.tags.subscriber)
  if (event.tags.env !== env || (kind !== 'daily' && kind !== 'daily_welcome') || subscriberId === null) return null
  const sendId = kind === 'daily' ? idOf(event.tags.send) : null
  const send = (status: EmailSendStatus, from: EmailSendStatus[], error: string | null = null, refund = false) =>
    sendId === null ? null : { id: sendId, status, from, error, refund }

  switch (event.type) {
    case 'email.sent':
      return { subscriberId, send: send('sent', ['sending']), stop: null }
    case 'email.delivered':
      return { subscriberId, send: send('delivered', ['sending', 'sent']), stop: null }
    case 'email.bounced': {
      // email.bounced is a permanent rejection; a temporary one, should it come, leaves the subscription alone.
      const permanent = event.bounceType === null || /^permanent$/i.test(event.bounceType)
      return { subscriberId, send: send('bounced', ['sending', 'sent', 'delivered'], event.detail), stop: permanent ? 'bounce' : null }
    }
    case 'email.suppressed':
      // On Resend's suppression list after an earlier bounce or complaint: nothing will reach it.
      return { subscriberId, send: send('bounced', ['sending', 'sent'], event.detail), stop: 'bounce' }
    case 'email.complained':
      return { subscriberId, send: send('complained', ['sending', 'sent', 'delivered', 'bounced']), stop: 'complaint' }
    case 'email.failed':
      // Failed on Resend's side; a later run tries again, and a used-up quota is not counted as a try.
      return { subscriberId, send: send('failed', ['sending', 'sent'], event.detail, /quota/i.test(event.detail ?? '')), stop: null }
    default:
      // delivery_delayed, opened and clicked (tracking is off), scheduled, received.
      return null
  }
}

/** A stop that comes in for an address already stopped: a complaint outranks a bounce, which outranks the owner's. Null: leave it. */
export function stopReasonAfter(current: Pick<Subscriber, 'status' | 'stopReason'>, incoming: 'bounce' | 'complaint'): StopReason | null {
  if (current.status === 'stopped' && (current.stopReason === 'complaint' || current.stopReason === incoming)) return null
  return incoming
}

/** Clocks differ a little between Resend and us. */
const CLOCK_SLACK_MS = 5 * 60 * 1000

/**
 * A bounce or complaint about an email sent before the reader last subscribed (they lifted the
 * stop on the manage page since) is old news: it does not stop them again.
 */
export function stopApplies(subscribedAt: string | null | undefined, sentAt: string | null): boolean {
  if (!subscribedAt || !sentAt || Number.isNaN(Date.parse(sentAt))) return true
  return Date.parse(sentAt) >= Date.parse(subscribedAt) - CLOCK_SLACK_MS
}

/** Applies an event once: 'duplicate' when this svix-id was handled before, 'ignored' when it is not ours. */
export async function handleDeliveryEvent(
  deliveryId: string,
  event: DeliveryEvent,
  now: Date,
  env: string = deploymentEnv(),
): Promise<'duplicate' | 'ignored' | 'applied'> {
  const { payload, db } = await getDb()
  const [seen] = await db.select({ id: emailEvents.id }).from(emailEvents).where(eq(emailEvents.id, deliveryId)).limit(1)
  if (seen) return 'duplicate'

  const plan = planEvent(event, env)
  const subscriber = plan
    ? await payload.findByID({ collection: 'subscribers', id: plan.subscriberId, depth: 0, overrideAccess: true, disableErrors: true })
    : null
  // The tags say who; the address must agree, or the event is about another email than the one tagged.
  const ours = plan && subscriber && subscriber.email === event.to?.toLowerCase() ? plan : null

  // Each change below is safe to repeat, so the id is written last: a failure halfway gets Resend's retry.
  if (ours?.send) {
    const { id, status, from, error, refund } = ours.send
    await db
      .update(emailSends)
      .set({
        status,
        resendId: sql`coalesce(${emailSends.resendId}, ${event.emailId})`,
        updatedAt: now,
        ...(error !== null && { error: error.slice(0, 1000) }),
        ...(refund && { attempts: sql`greatest(${emailSends.attempts} - 1, 0)` }),
      })
      .where(
        and(
          eq(emailSends.id, id),
          eq(emailSends.subscriberId, ours.subscriberId),
          inArray(emailSends.status, from),
          event.emailId ? or(isNull(emailSends.resendId), eq(emailSends.resendId, event.emailId)) : undefined,
        ),
      )
  }
  if (ours?.stop && subscriber && stopApplies(subscriber.subscribedAt, event.sentAt)) {
    const stopReason = stopReasonAfter(subscriber, ours.stop)
    if (stopReason) {
      await payload.update({ collection: 'subscribers', id: subscriber.id, data: { status: 'stopped', stopReason }, overrideAccess: true })
    }
  }
  await db.insert(emailEvents).values({ id: deliveryId, type: event.type, receivedAt: now }).onConflictDoNothing()
  return ours ? 'applied' : 'ignored'
}
