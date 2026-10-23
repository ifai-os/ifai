import { getDb } from '@/lib/db/drizzle'
import type { Subscriber } from '@/payload-types'

import { subscriberIdFromToken } from './links'
import { planManage, type ManageAction } from './rules'

/** The subscriber a link's token belongs to, or null for a wrong token or a deleted subscription. */
export async function subscriberForToken(token: unknown): Promise<Subscriber | null> {
  const id = subscriberIdFromToken(token)
  if (id === null) return null
  const { payload } = await getDb()
  return payload.findByID({ collection: 'subscribers', id, depth: 0, overrideAccess: true, disableErrors: true })
}

/** Applies a manage-page or one-click action (planManage); returns the subscriber as it is now, or 'forbidden'. */
export async function manage(subscriber: Subscriber, action: ManageAction, now: Date): Promise<Subscriber | 'forbidden'> {
  const changes = planManage(subscriber, action, now)
  if (changes === 'forbidden') return 'forbidden'
  if (changes === 'unchanged') return subscriber
  const { payload } = await getDb()
  return payload.update({ collection: 'subscribers', id: subscriber.id, data: changes, overrideAccess: true })
}
