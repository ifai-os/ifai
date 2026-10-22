/**
 * The site owner's working day: Shanghai time (UTC+8, no daylight saving). Used for the
 * daily model budget and the daily poster; readers always see their own time zone.
 */
const OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** The instant the Shanghai calendar day containing `now` began. */
export function shanghaiDayStart(now: Date = new Date()): Date {
  const local = now.getTime() + OFFSET_MS
  return new Date(local - (local % DAY_MS) - OFFSET_MS)
}

/** The Shanghai calendar date of `now`, as YYYY-MM-DD. */
export function shanghaiDate(now: Date = new Date()): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10)
}
