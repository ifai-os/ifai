import { and, count, eq, gt } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { getDb } from '@/lib/db/drizzle'
import type { Subscriber } from '@/payload-types'

import { sendEmail } from './delivery'
import { ATTEMPTS_PER_HOUR, planSubscribe, welcomeAllowed, type SubscribeRequest } from './rules'
import { subscribeAttempts } from './schema'
import { buildWelcomeEmail } from './welcome'

/** Records the attempt, and says whether the visitor is still under the hourly limit. */
export async function attemptAllowed(visitorHash: string, now: Date): Promise<boolean> {
  const { db } = await getDb()
  const since = new Date(now.getTime() - 60 * 60 * 1000)
  const [row] = await db
    .select({ count: count() })
    .from(subscribeAttempts)
    .where(and(eq(subscribeAttempts.visitorHash, visitorHash), gt(subscribeAttempts.createdAt, since)))
  if (Number(row?.count ?? 0) >= ATTEMPTS_PER_HOUR) return false
  await db.insert(subscribeAttempts).values({ visitorHash, createdAt: now })
  return true
}

export async function findSubscriberByEmail(payload: Payload, email: string): Promise<Subscriber | null> {
  const { docs } = await payload.find({
    collection: 'subscribers',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/**
 * Subscribes the address, or leaves its subscription alone (planSubscribe). Returns the
 * subscriber to welcome, or null when no welcome email is due.
 */
export async function subscribe(request: SubscribeRequest, now: Date): Promise<Subscriber | null> {
  const { payload } = await getDb()
  const existing = await findSubscriberByEmail(payload, request.email)
  const plan = planSubscribe(existing)
  const consent = {
    locale: request.locale,
    timeZone: request.timeZone,
    sourcePage: request.page,
    subscribedAt: now.toISOString(),
  }

  if (plan === 'create') {
    try {
      const created = await payload.create({
        collection: 'subscribers',
        data: { email: request.email, status: 'subscribed', ...consent },
        overrideAccess: true,
      })
      return created
    } catch (error) {
      // The same address submitted twice at once: the other request created it.
      if (await findSubscriberByEmail(payload, request.email)) return null
      throw error
    }
  }

  if (plan === 'resubscribe' && existing) {
    const updated = await payload.update({
      collection: 'subscribers',
      id: existing.id,
      data: { status: 'subscribed', stopReason: null, unsubscribedAt: null, ...consent },
      overrideAccess: true,
    })
    return welcomeAllowed(existing.welcomeSentAt, now) ? updated : null
  }

  return null
}

/** After the welcome email went out: remember when, for the once-a-day limit. */
export async function markWelcomed(subscriberId: number, now: Date): Promise<void> {
  const { payload } = await getDb()
  await payload.update({
    collection: 'subscribers',
    id: subscriberId,
    data: { welcomeSentAt: now.toISOString() },
    overrideAccess: true,
  })
}

/** Sends the welcome email and remembers it. Runs after the response, so the page never waits on Resend. */
export async function sendWelcome(subscriber: Subscriber, now: Date): Promise<void> {
  try {
    await sendEmail(await buildWelcomeEmail(subscriber, now))
    await markWelcomed(subscriber.id, now)
  } catch (error) {
    console.error(`[daily-email] Welcome email to subscriber ${subscriber.id} failed:`, error)
  }
}
