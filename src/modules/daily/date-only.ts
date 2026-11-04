import { dayKey } from '@/lib/local-time'

/*
 * Publish times that only know the day (docs/specs/daily.md「发布时间」, 2026-11-04): a source that
 * gives a date and no time of day comes in as midnight. A feed's date is read as midnight UTC;
 * the editors' Feishu table works in Los Angeles time, so a date typed there comes back as
 * midnight in Los Angeles. Shown in the reader's zone such a time is made up (0:00 in Los
 * Angeles, 15:00 in Shanghai), so the pages show the day alone, and the day as it was given
 * whatever the reader's zone. A story really out at 00:00:00 to the second is taken as one of
 * these too; it only loses its time.
 */

/** The zones a date with no time becomes midnight in: feeds' (UTC), then the editors' table's. */
export const dateOnlyZones = ['UTC', 'America/Los_Angeles'] as const

const clockFormats = new Map<string, Intl.DateTimeFormat>()

function clockIn(date: Date, timeZone: string): string {
  let format = clockFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    clockFormats.set(timeZone, format)
  }
  return format.format(date)
}

/** The day a date-only publish time stands for, as "YYYY-MM-DD"; null for a time of day. */
export function dateOnlyDay(instant: string | Date): string | null {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime()) || date.getUTCMilliseconds() !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMinutes() !== 0) return null
  const zone = dateOnlyZones.find((timeZone) => clockIn(date, timeZone) === '00:00:00')
  return zone ? dayKey(date, zone) : null
}

/** Whether the publish time has a time of day worth showing. */
export function hasClockTime(instant: string | Date): boolean {
  return dateOnlyDay(instant) === null
}

/** The calendar day a story is listed under: the given day when it only has one, else its day in the reader's zone. */
export function storyDayKey(instant: string | Date, timeZone: string): string {
  return dateOnlyDay(instant) ?? dayKey(new Date(instant), timeZone)
}
