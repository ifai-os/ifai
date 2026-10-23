import type { Locale } from '@/i18n/config'

/**
 * A zone's name in a language, for "every morning at 8:00 (Japan Standard Time)": the generic
 * name from Intl ("Pacific Time", "北美太平洋时间"), or the IANA name when Intl has none.
 */
export function zoneName(timeZone: string, locale: Locale, at: Date = new Date()): string {
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') return 'UTC'
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' }).formatToParts(at)
    return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone
  } catch {
    return timeZone
  }
}

/** "Saturday, October 24 at 8:00 AM" / "10月24日星期六 8:00", on the subscriber's clock. */
export function sendTimeLabel(instant: Date, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant)
}
