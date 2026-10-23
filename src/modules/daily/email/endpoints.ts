import { count, gte, isNotNull, and } from '@payloadcms/db-postgres/drizzle'
import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getDb } from '@/lib/db/drizzle'
import { shanghaiDate, shanghaiDayStart } from '@/lib/shanghai-day'
import { dailyEmailEnabled } from '@/lib/switches'

import { digestStories } from './content'
import { deliveryConfigured, isDeployed, ResendError, sendEmail } from './delivery'
import { buildDigestEmail } from './digest'
import { quotaView, upgradeDue, utcDayStart, type SendCounts, type SubscriberOverview } from './overview'
import { readResendState, recordFailure, recordQuota } from './resend-state'
import { emailSends, emailSendStatuses } from './schema'

async function subscriberCounts(payload: Payload) {
  const tally = async (where: Parameters<Payload['count']>[0]['where']) =>
    (await payload.count({ collection: 'subscribers', where, overrideAccess: true })).totalDocs
  const [perLocale, unsubscribed, stopped] = await Promise.all([
    Promise.all(locales.map((locale) => tally({ status: { equals: 'subscribed' }, locale: { equals: locale } }))),
    tally({ status: { equals: 'unsubscribed' } }),
    tally({ status: { equals: 'stopped' } }),
  ])
  const byLocale = Object.fromEntries(locales.map((locale, index) => [locale, perLocale[index]])) as Record<Locale, number>
  return { subscribed: perLocale.reduce((sum, value) => sum + value, 0), byLocale, unsubscribed, stopped }
}

/** Morning emails claimed since the start of the Shanghai day, by status. */
async function sendCounts(now: Date): Promise<SendCounts> {
  const { db } = await getDb()
  const rows = await db
    .select({ status: emailSends.status, count: count() })
    .from(emailSends)
    .where(gte(emailSends.createdAt, shanghaiDayStart(now)))
    .groupBy(emailSends.status)
  const counts = Object.fromEntries(emailSendStatuses.map((status) => [status, 0])) as SendCounts
  for (const row of rows) counts[row.status] = Number(row.count)
  return counts
}

/** What this site sent since 00:00 UTC, when Resend's free-plan day starts: morning emails and welcome emails. */
async function sentSinceUtcMidnight(payload: Payload, now: Date): Promise<number> {
  const { db } = await getDb()
  const since = utcDayStart(now)
  const [[daily], welcomes] = await Promise.all([
    db
      .select({ count: count() })
      .from(emailSends)
      .where(and(isNotNull(emailSends.sentAt), gte(emailSends.sentAt, since))),
    payload.count({ collection: 'subscribers', where: { welcomeSentAt: { greater_than_equal: since.toISOString() } }, overrideAccess: true }),
  ])
  return Number(daily?.count ?? 0) + welcomes.totalDocs
}

async function overview(req: PayloadRequest): Promise<SubscriberOverview> {
  const now = new Date()
  const [counts, today, sentToday, state] = await Promise.all([
    subscriberCounts(req.payload),
    sendCounts(now),
    sentSinceUtcMidnight(req.payload, now),
    readResendState(),
  ])
  const quota = quotaView(state, sentToday, now)
  return {
    ...counts,
    sending: { enabled: dailyEmailEnabled(), configured: deliveryConfigured(), deployed: isDeployed() },
    today: { date: shanghaiDate(now), counts: today },
    quota,
    lastFailure: state?.lastError && state.lastErrorAt ? { message: state.lastError, at: state.lastErrorAt.toISOString() } : null,
    upgrade: upgradeDue(quota, counts.subscribed),
    you: String(req.user?.email ?? ''),
  }
}

function localeParam(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale
}

/**
 * The email as it would go out now, in a language, to the signed-in admin: the stories of the
 * past 24 hours, dated by the Shanghai day. Null when there is nothing to send.
 */
async function emailNow(req: PayloadRequest, locale: Locale) {
  const now = new Date()
  const stories = await digestStories(req.payload, now)
  if (!stories.length) return null
  return buildDigestEmail({ email: String(req.user?.email ?? ''), locale, subscriberId: null }, shanghaiDate(now), stories)
}

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** Back-office endpoints on `subscribers`, for admins only. */
export const subscriberEndpoints: Endpoint[] = [
  {
    // GET /api/subscribers/overview — the numbers above the subscriber list.
    path: '/overview',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ error: 'unauthorized' }, 401)
      return json(await overview(req))
    },
  },
  {
    // GET /api/subscribers/preview?locale=ja — the email that would go out now: { subject, preheader, html }, or { empty: true }.
    path: '/preview',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ error: 'unauthorized' }, 401)
      const email = await emailNow(req, localeParam(req.searchParams?.get('locale')))
      if (!email) return json({ empty: true })
      return json({ subject: email.subject, from: email.senderName, html: email.html, bytes: Buffer.byteLength(email.html) })
    },
  },
  {
    // POST /api/subscribers/test-email { locale } — the same email to the signed-in admin; no send record (「后台」).
    path: '/test-email',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ error: 'unauthorized' }, 401)
      const site = req.headers.get('sec-fetch-site')
      if (site && site !== 'same-origin') return json({ error: 'cross-site' }, 403)
      if (isDeployed() && !deliveryConfigured()) return json({ error: 'not_configured' }, 409)
      const body = ((await req.json?.().catch(() => null)) ?? {}) as { locale?: unknown }
      const email = await emailNow(req, localeParam(body.locale))
      if (!email) return json({ error: 'no_stories' }, 409)
      const now = new Date()
      try {
        const { quota } = await sendEmail(email)
        await recordQuota(quota, now)
      } catch (error) {
        if (!(error instanceof ResendError)) throw error
        await recordQuota(error.quota, now)
        await recordFailure(error.message, now)
        return json({ error: 'refused', message: error.message }, 502)
      }
      return json({ sent: true, to: email.to, printed: !deliveryConfigured() })
    },
  },
]
