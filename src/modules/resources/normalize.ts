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

/** The number after the highest one taken on that date. Counting would collide with a number still in use once one is deleted. */
export function nextSubmissionSequence(codes: (string | null | undefined)[]): number {
  const taken = codes.map((code) => Number(/^S-\d{4}-(\d+)$/.exec(code ?? '')?.[1] ?? 0))
  return Math.max(0, ...taken) + 1
}

/** Numeric comparison of 1.2.10 vs 1.2.9; a pre-release tag sorts before the plain version. */
export function compareVersions(a: string, b: string): number {
  const split = (value: string) => {
    const [core, tag] = normalizeVersion(value).split(/[-+]/, 2)
    return { parts: core.split('.').map(Number), tag: tag ?? '' }
  }
  const left = split(a)
  const right = split(b)
  const length = Math.max(left.parts.length, right.parts.length)
  for (let i = 0; i < length; i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (left.tag === right.tag) return 0
  if (!left.tag) return 1
  if (!right.tag) return -1
  return left.tag < right.tag ? -1 : 1
}

/** The number for an imported version when neither the request nor SKILL.md names one. */
export function nextVersion(existing: string[]): string {
  const valid = existing.map(normalizeVersion).filter(isValidVersion)
  if (!valid.length) return '1.0.0'
  const latest = valid.sort(compareVersions).at(-1)!
  const parts = latest.split(/[-+]/, 1)[0].split('.').map(Number)
  parts[parts.length - 1] += 1
  let candidate = parts.join('.')
  while (valid.includes(candidate)) {
    parts[parts.length - 1] += 1
    candidate = parts.join('.')
  }
  return candidate
}
