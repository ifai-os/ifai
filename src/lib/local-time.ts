/**
 * Calendar days in the reader's time zone (docs/specs/daily.md「页面与路由」). The server
 * renders every time in UTC with a `datetime` attribute; after hydration the browser renders
 * again in its own zone (see components/local-time.tsx), so stories are grouped and timed by
 * the reader's local date, never the server's.
 */
export const serverTimeZone = 'UTC'

const dayFormats = new Map<string, Intl.DateTimeFormat>()

function dayFormat(timeZone: string): Intl.DateTimeFormat {
  let format = dayFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormats.set(timeZone, format)
  }
  return format
}

/** The calendar date of an instant in a time zone, as "YYYY-MM-DD". */
export function dayKey(date: Date, timeZone: string): string {
  const parts: Record<string, string> = {}
  for (const part of dayFormat(timeZone).formatToParts(date)) parts[part.type] = part.value
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** UTC midnight of a calendar date, for components that read a date with the UTC getters (DateBadge). */
export function dateOfKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`)
}

export type DayGroup<T> = { key: string; date: Date; items: T[] }

/** Splits items (newest first) into runs that share a calendar date in the time zone. */
export function groupByDay<T>(items: readonly T[], instantOf: (item: T) => string | Date, timeZone: string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    const key = dayKey(new Date(instantOf(item)), timeZone)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, date: dateOfKey(key), items: [item] })
  }
  return groups
}

/** "today" or "yesterday" for a calendar date, relative to today's key in the same zone; null for earlier days. */
export function relativeDay(key: string, today: string): 'today' | 'yesterday' | null {
  if (key === today) return 'today'
  const yesterday = dayKey(new Date(dateOfKey(today).getTime() - 86_400_000), serverTimeZone)
  return key === yesterday ? 'yesterday' : null
}

/** Whether the name is an IANA time zone this runtime knows ("Asia/Tokyo", "UTC"). */
export function isTimeZone(name: string): boolean {
  if (!name || name.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return true
  } catch {
    return false
  }
}

/** The browser's time zone, or UTC when it cannot be read. */
export function readerTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isTimeZone(zone) ? zone : serverTimeZone
  } catch {
    return serverTimeZone
  }
}
