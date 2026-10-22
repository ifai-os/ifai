/** Calendar days as YYYY-MM-DD strings, the way the heat tables store them (Shanghai days). */

const DAY_MS = 24 * 60 * 60 * 1000

/** "2026-10-23" + 7 → "2026-10-30"; negative counts go back. */
export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10)
}

/** The instant a Shanghai calendar day begins (UTC+8, no daylight saving). */
export function shanghaiMidnight(day: string): Date {
  return new Date(`${day}T00:00:00+08:00`)
}
