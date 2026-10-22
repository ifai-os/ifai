/** "v2.4.0" → "2.4.0". Versions are stored without the leading v and shown with it. */
export function normalizeVersion(value: string): string {
  return value.trim().replace(/^[vV]/, '')
}

const versionPattern = /^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/

/** 2.4.0, 2026.10.18, 1.0.0-beta.1 … — digits separated by dots, with an optional pre-release tag. */
export function isValidVersion(value: string): boolean {
  return versionPattern.test(value)
}

/** "sha256:9F3A…" → "9f3a…". */
export function normalizeSha256(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '')
}

export function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

/** "2026-10-22" for the given instant, in Shanghai time (UTC+8), the site owner's day. */
export function shanghaiDay(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/** Start of that Shanghai day as an instant, for "submissions created today" queries. */
export function shanghaiDayStart(date: Date): Date {
  return new Date(`${shanghaiDay(date)}T00:00:00+08:00`)
}

/** Submission number shown to the submitter, e.g. "S-1022-07": Shanghai month-day + that day's sequence. */
export function submissionCode(date: Date, sequence: number): string {
  const [, month, day] = shanghaiDay(date).split('-')
  return `S-${month}${day}-${String(sequence).padStart(2, '0')}`
}
