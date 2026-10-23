import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { isTimeZone, serverTimeZone } from '@/lib/local-time'
import type { Subscriber } from '@/payload-types'

import { normalizeEmail } from './address'
import { managePath } from './links'

/**
 * The subscription rules of docs/specs/daily-email.md as plain functions: what a submission or a
 * manage-page action does to a subscriber. ./subscribe.ts and ./manage.ts apply them.
 */

/** Presses of「订阅」one visitor may make in an hour (rule 9). */
export const ATTEMPTS_PER_HOUR = 10
/** One welcome email per address per day, however often it is submitted (rule 9). */
const WELCOME_EVERY_MS = 24 * 60 * 60 * 1000

export type SubscribeRequest = {
  email: string
  locale: Locale
  timeZone: string
  /** The page the box was on, as the record of where the reader agreed. */
  page: string | null
  /** The hidden field was filled in: a form-filling robot. */
  robot: boolean
}

/** POST /api/subscriptions body → a clean request, or null when it is not one. */
export function readSubscribeRequest(body: unknown): SubscribeRequest | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  if (typeof input.email !== 'string' || input.email.length > 320) return null
  const page = typeof input.page === 'string' && /^\/(?!\/)\S{0,199}$/.test(input.page) ? input.page : null
  return {
    email: normalizeEmail(input.email),
    locale: isLocale(input.locale) ? input.locale : defaultLocale,
    timeZone: typeof input.timeZone === 'string' && isTimeZone(input.timeZone) ? input.timeZone : serverTimeZone,
    page,
    robot: typeof input.website === 'string' && input.website.trim() !== '',
  }
}

/**
 * What a submission does to the subscription already there (rule 4): a new address is
 * subscribed, an unsubscribed one comes back, and anything else is left as it is: a current
 * subscription keeps its language and time zone, a stopped one stays stopped.
 */
export function planSubscribe(existing: Pick<Subscriber, 'status'> | null): 'create' | 'resubscribe' | 'keep' {
  if (!existing) return 'create'
  return existing.status === 'unsubscribed' ? 'resubscribe' : 'keep'
}

/** Whether another welcome email may go to this address now. */
export function welcomeAllowed(lastWelcome: string | null | undefined, now: Date): boolean {
  return !lastWelcome || now.getTime() - Date.parse(lastWelcome) >= WELCOME_EVERY_MS
}

/** What the manage page and one-click unsubscribe can do (「页面与路由」). */
export type ManageAction =
  | { type: 'update'; locale: Locale; timeZone: string }
  | { type: 'unsubscribe' }
  | { type: 'resubscribe' }

export type ManageRequest = { token: string; action: ManageAction; pageLocale: Locale }

/** POST /api/subscriptions/manage body → a clean request, or null when it is not one. */
export function readManageRequest(body: unknown): ManageRequest | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  if (typeof input.token !== 'string' || !isLocale(input.pageLocale)) return null
  const base = { token: input.token, pageLocale: input.pageLocale }
  switch (input.action) {
    case 'unsubscribe':
    case 'resubscribe':
      return { ...base, action: { type: input.action } }
    case 'update':
      if (!isLocale(input.locale) || typeof input.timeZone !== 'string' || !isTimeZone(input.timeZone)) return null
      return { ...base, action: { type: 'update', locale: input.locale, timeZone: input.timeZone } }
    default:
      return null
  }
}

export type SubscriberChanges = Partial<
  Pick<Subscriber, 'locale' | 'timeZone' | 'status' | 'stopReason' | 'subscribedAt' | 'unsubscribedAt' | 'sourcePage'>
>

/**
 * The changes an action makes, 'unchanged' when there is nothing to do, or 'forbidden'. Readers
 * may lift a stop after a bounce or a complaint here (and only here, rule 4); a stop by the
 * owner stays.
 */
export function planManage(
  subscriber: Pick<Subscriber, 'status' | 'stopReason' | 'locale' | 'timeZone'>,
  action: ManageAction,
  now: Date,
): SubscriberChanges | 'unchanged' | 'forbidden' {
  switch (action.type) {
    case 'update':
      if (action.locale === subscriber.locale && action.timeZone === subscriber.timeZone) return 'unchanged'
      return { locale: action.locale, timeZone: action.timeZone }
    case 'unsubscribe':
      if (subscriber.status !== 'subscribed') return 'unchanged'
      return { status: 'unsubscribed', unsubscribedAt: now.toISOString() }
    case 'resubscribe':
      if (subscriber.status === 'subscribed') return 'unchanged'
      if (subscriber.status === 'stopped' && subscriber.stopReason === 'owner') return 'forbidden'
      return {
        status: 'subscribed',
        stopReason: null,
        unsubscribedAt: null,
        subscribedAt: now.toISOString(),
        sourcePage: managePath(subscriber.locale),
      }
  }
}
