import type { Endpoint, Payload } from 'payload'

import { locales, type Locale } from '@/i18n/config'

export type SubscriberCountsResponse = {
  /** Subscribed now, in all languages and per language. */
  subscribed: number
  byLocale: Record<Locale, number>
  unsubscribed: number
  stopped: number
}

async function subscriberCounts(payload: Payload): Promise<SubscriberCountsResponse> {
  const count = async (where: Parameters<Payload['count']>[0]['where']) =>
    (await payload.count({ collection: 'subscribers', where, overrideAccess: true })).totalDocs
  const [perLocale, unsubscribed, stopped] = await Promise.all([
    Promise.all(locales.map((locale) => count({ status: { equals: 'subscribed' }, locale: { equals: locale } }))),
    count({ status: { equals: 'unsubscribed' } }),
    count({ status: { equals: 'stopped' } }),
  ])
  const byLocale = Object.fromEntries(locales.map((locale, index) => [locale, perLocale[index]])) as Record<Locale, number>
  return { subscribed: perLocale.reduce((sum, value) => sum + value, 0), byLocale, unsubscribed, stopped }
}

/** Back-office endpoints on `subscribers`, for admins only. */
export const subscriberEndpoints: Endpoint[] = [
  {
    // GET /api/subscribers/counts — the numbers above the subscriber list.
    path: '/counts',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      return Response.json(await subscriberCounts(req.payload))
    },
  },
]
