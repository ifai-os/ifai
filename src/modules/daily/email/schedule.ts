/**
 * When the morning email goes out (docs/specs/daily-email.md rule 5): 8:00 on the subscriber's
 * own clock. Wall-clock times are read through Intl with the IANA zone, so daylight saving and
 * half-hour zones (Asia/Kolkata, Asia/Kathmandu) need no tables of our own.
 */
export const sendHour = 8

type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number }

const wallFormats = new Map<string, Intl.DateTimeFormat>()

function wallFormat(timeZone: string): Intl.DateTimeFormat {
  let format = wallFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    wallFormats.set(timeZone, format)
  }
  return format
}

/** What a clock in the zone shows at the instant. */
export function wallTime(instant: Date, timeZone: string): WallTime {
  const parts: Record<string, number> = {}
  for (const part of wallFormat(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

/** How far the zone's clock is ahead of UTC at the instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const wall = wallTime(new Date(instant), timeZone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** The instant a clock in the zone shows this date and time. */
export function zonedInstant(date: { year: number; month: number; day: number }, hour: number, minute: number, timeZone: string): Date {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  const first = offsetAt(asUtc, timeZone)
  const second = offsetAt(asUtc - first, timeZone)
  return new Date(asUtc - second)
}

/** The first 8:00 on the subscriber's clock after `now`: the next email, and the first one after subscribing. */
export function nextSendAt(now: Date, timeZone: string): Date {
  const today = wallTime(now, timeZone)
  const atEight = zonedInstant(today, sendHour, 0, timeZone)
  if (atEight.getTime() > now.getTime()) return atEight
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1))
  return zonedInstant(
    { year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate() },
    sendHour,
    0,
    timeZone,
  )
}
