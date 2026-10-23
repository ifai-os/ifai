import { and, eq, lt } from '@payloadcms/db-postgres/drizzle'

import { getDb } from '@/lib/db/drizzle'

import { emailEvents, emailSends, subscribeAttempts } from './schema'

const DAY_MS = 24 * 3_600_000
/** Rule 10: an unsubscribed subscription is deleted 30 days on; bounces and complaints stay, so the address is never written to again. */
export const UNSUBSCRIBED_KEPT_DAYS = 30
/** Resend retries a webhook for about a day; a week of ids is plenty to spot a repeat. */
const EVENTS_KEPT_DAYS = 7

export async function cleanUp(now: Date) {
  const { payload, db } = await getDb()
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS)

  // One by one through Payload, so the collection's afterDelete keeps their send numbers.
  const { docs } = await payload.delete({
    collection: 'subscribers',
    where: { and: [{ status: { equals: 'unsubscribed' } }, { unsubscribedAt: { less_than: before(UNSUBSCRIBED_KEPT_DAYS).toISOString() } }] },
    depth: 0,
    overrideAccess: true,
  })
  const attempts = await db.delete(subscribeAttempts).where(lt(subscribeAttempts.createdAt, before(1)))
  const events = await db.delete(emailEvents).where(lt(emailEvents.receivedAt, before(EVENTS_KEPT_DAYS)))
  // A claim whose run died without its failure handler: its morning is long over.
  const stuck = await db
    .update(emailSends)
    .set({ status: 'failed', error: 'Never sent: the run that claimed it stopped.', updatedAt: now })
    .where(and(eq(emailSends.status, 'sending'), lt(emailSends.updatedAt, before(1))))

  return { subscribers: docs.length, attempts: attempts.rowCount ?? 0, events: events.rowCount ?? 0, stuck: stuck.rowCount ?? 0 }
}
