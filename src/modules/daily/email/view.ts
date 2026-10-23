import { localeNames, type Locale } from '@/i18n/config'
import { isTimeZone } from '@/lib/local-time'
import type { Subscriber } from '@/payload-types'

import type { StopReason, SubscriberStatus } from '../collections/subscribers'
import { maskEmail } from './address'
import { sendTimeLabel, zoneName } from './format'
import { nextSendAt } from './schedule'

/** What the manage page shows, worded in the page's language. */
export type SubscriptionView = {
  email: string
  status: SubscriberStatus
  stopReason: StopReason | null
  locale: Locale
  timeZone: string
  /** "Saturday, October 24 at 8:00 AM" and the zone's name, while subscribed and the email is on. */
  next: { time: string; zone: string } | null
}

/** `sending`: whether the daily email goes out here at all (subscribingOpen), so a next one is coming. */
export function subscriptionView(subscriber: Subscriber, pageLocale: Locale, now: Date, sending: boolean): SubscriptionView {
  const { status, timeZone } = subscriber
  return {
    email: maskEmail(subscriber.email),
    status,
    stopReason: status === 'stopped' ? (subscriber.stopReason ?? null) : null,
    locale: subscriber.locale,
    timeZone,
    next:
      status === 'subscribed' && sending
        ? { time: sendTimeLabel(nextSendAt(now, timeZone), timeZone, pageLocale), zone: zoneName(timeZone, pageLocale, now) }
        : null,
  }
}

export type ZoneOption = { value: string; label: string }

/**
 * Every time zone for the manage page's list, "Asia/Tokyo (GMT+9)", plus UTC and the
 * subscriber's own zone when the runtime's list leaves them out (it names some zones by older
 * aliases, Asia/Calcutta for Asia/Kolkata).
 */
export function zoneOptions(current: string, now: Date): ZoneOption[] {
  const names = new Set(Intl.supportedValuesOf('timeZone'))
  names.add('UTC')
  if (isTimeZone(current)) names.add(current)
  return [...names].sort().map((value) => {
    let offset = ''
    try {
      offset =
        new Intl.DateTimeFormat('en-US', { timeZone: value, timeZoneName: 'shortOffset' })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value ?? ''
    } catch {
      // Listed by Intl but not formattable: show the name alone.
    }
    const name = value.replace(/_/g, ' ')
    return { value, label: offset ? `${name} (${offset})` : name }
  })
}

/** The five languages in their own names, for the manage page's list. */
export const languageOptions = (Object.entries(localeNames) as [Locale, string][]).map(([value, label]) => ({ value, label }))
