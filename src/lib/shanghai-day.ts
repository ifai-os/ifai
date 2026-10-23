/**
 * The site owner's working day: Shanghai time (UTC+8, no daylight saving). Used for the
 * daily model budget, the daily poster and review deadlines; readers always see their own time zone.
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

/**
 * Noon in Shanghai, `days` working days (Monday to Friday) after the Shanghai day of `from`: the
 * day a review promised in working days should be done by. Public holidays are not counted, so
 * pages call it an estimate.
 */
export function shanghaiWorkingDaysAfter(from: Date, days: number): Date {
  // Noon in Shanghai is 04:00 UTC on the same date, so the UTC weekday is Shanghai's.
  const day = new Date(`${shanghaiDate(from)}T12:00:00+08:00`)
  for (let left = days; left > 0; ) {
    day.setTime(day.getTime() + DAY_MS)
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) left -= 1
  }
  return day
}
