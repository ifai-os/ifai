import type { Locale } from '@/i18n/config'

import type { EmailSendStatus } from './schema'

/**
 * The numbers above the subscriber list (docs/specs/daily-email.md「后台」), worked out from
 * what the endpoint reads; pure, so the warnings are tested without a database.
 */

/** Resend's free plan: 100 emails a day (UTC), shared with the sign-in emails. */
export const FREE_DAILY_LIMIT = 100
/** Around here the free plan stops being enough (the spec's「订阅者到 80 人左右」). */
export const FREE_PLAN_SUBSCRIBERS = 80
/** Fewer left than this today: flagged. */
const LOW_REMAINING = 20

export type QuotaView =
  | {
      plan: 'free'
      limit: number
      /** Emails used today (UTC): Resend's own count when the last reading is from today, or at least what this site sent. */
      used: number
      remaining: number
      /** When Resend's count was read; null when only this site's own count is known. */
      readAt: string | null
      low: boolean
    }
  | { plan: 'paid'; monthlyUsed: number | null; readAt: string }

export type QuotaReading = { dailyUsed: number | null; monthlyUsed: number | null; readAt: Date | null }

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Resend sends the daily count only to free-plan accounts: a reading with a monthly count and
 * no daily one is a paid plan, which has no daily limit.
 */
export function quotaView(reading: QuotaReading | null, sentToday: number, now: Date): QuotaView {
  if (reading?.readAt && reading.dailyUsed === null && reading.monthlyUsed !== null) {
    return { plan: 'paid', monthlyUsed: reading.monthlyUsed, readAt: reading.readAt.toISOString() }
  }
  const today = reading?.readAt && reading.dailyUsed !== null && reading.readAt >= utcDayStart(now) ? reading : null
  const used = Math.max(sentToday, today?.dailyUsed ?? 0)
  const remaining = Math.max(0, FREE_DAILY_LIMIT - used)
  return { plan: 'free', limit: FREE_DAILY_LIMIT, used, remaining, readAt: today?.readAt?.toISOString() ?? null, low: remaining < LOW_REMAINING }
}

export type SendCounts = Record<EmailSendStatus, number>

export type SubscriberOverview = {
  /** Subscribed now, in all languages and per language. */
  subscribed: number
  byLocale: Record<Locale, number>
  unsubscribed: number
  stopped: number
  /** DAILY_EMAIL_ENABLED, and whether Resend and DAILY_EMAIL_FROM are set (needed on Vercel). */
  sending: { enabled: boolean; configured: boolean; deployed: boolean }
  /** The morning emails claimed today, Shanghai time (the back office's day), by how they ended. */
  today: { date: string; counts: SendCounts }
  quota: QuotaView
  lastFailure: { message: string; at: string } | null
  /** Time to move to Resend Pro: the free plan's 100 a day will not cover every subscriber. */
  upgrade: boolean
  /** The signed-in admin, who gets the test email. */
  you: string
}

/** Whether to say it is time for Pro: on the free plan, with the subscribers near what it covers. */
export function upgradeDue(quota: QuotaView, subscribed: number): boolean {
  return quota.plan === 'free' && subscribed >= FREE_PLAN_SUBSCRIBERS
}
