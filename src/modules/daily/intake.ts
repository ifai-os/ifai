import type { FoundItem, SourceUse } from './types'

/** Items first seen more than this long after publication only go to the archive. */
export const MAX_AGE_MS = 48 * 60 * 60 * 1000
/** A new source's first fetch keeps at most this many items, all archived. */
export const FIRST_IMPORT_LIMIT = 30

export type Triage = {
  /** New items recent enough for "today" and the review queue. */
  fresh: FoundItem[]
  /** New items that are only kept for the record: old ones, and a new source's backlog. */
  archive: FoundItem[]
}

/**
 * The collection rules from the spec, applied to one fetch: skip URLs we already have, keep
 * each URL once, archive anything published over 48 hours before now, and on a source's first
 * fetch archive everything, newest 30 only.
 */
export function triage(
  found: FoundItem[],
  { now, known, firstImport }: { now: Date; known: ReadonlySet<string>; firstImport: boolean },
): Triage {
  const seen = new Set<string>()
  const fresh: FoundItem[] = []
  const archive: FoundItem[] = []

  for (const item of found) {
    if (known.has(item.url) || seen.has(item.url)) continue
    seen.add(item.url)
    const age = item.publishedAt ? now.getTime() - item.publishedAt.getTime() : 0
    if (firstImport || age > MAX_AGE_MS) archive.push(item)
    else fresh.push(item)
  }

  if (firstImport) {
    archive.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    archive.splice(FIRST_IMPORT_LIMIT)
  }
  return { fresh, archive }
}

export const INTERVAL_MIN_MINUTES = 15
export const INTERVAL_MAX_MINUTES = 60
export const HOT_SIGNAL_MAX_MINUTES = 180

/**
 * How long to wait between fetches, from how much a source produced in the last 7 days:
 * about four checks per expected item, clamped to 15–60 minutes (15–180 for hot_signal).
 */
export function nextIntervalMinutes(itemsLast7Days: number, use: SourceUse): number {
  const perDay = Math.max(itemsLast7Days, 0) / 7
  const max = use === 'hot_signal' ? HOT_SIGNAL_MAX_MINUTES : INTERVAL_MAX_MINUTES
  if (perDay <= 0) return max
  const minutes = Math.round(1440 / perDay / 4)
  return Math.min(max, Math.max(INTERVAL_MIN_MINUTES, minutes))
}
