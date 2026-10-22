import type { Source } from '@/payload-types'

import { HOT_SIGNAL_MAX_MINUTES, INTERVAL_MAX_MINUTES, nextIntervalMinutes } from '../intake'

/** Fields of a source that the collection jobs read. */
export type SourceSchedule = Pick<Source, 'enabled' | 'nextFetchAt' | 'intervalMinutes' | 'use' | 'firstFetchedAt'>

/** Due when enabled and never fetched, or when its next fetch time has passed. */
export function isDue(source: Pick<SourceSchedule, 'enabled' | 'nextFetchAt'>, now: Date): boolean {
  if (!source.enabled) return false
  return !source.nextFetchAt || new Date(source.nextFetchAt).getTime() <= now.getTime()
}

/** What to write back to the source after one fetch. Dates are ISO strings for Payload. */
export type SourcePatch = {
  lastFetchedAt: string
  nextFetchAt: string
  lastSuccessAt?: string
  firstFetchedAt?: string
  lastError: string | null
  lastItemCount?: number
  itemsLast7Days?: number
  intervalMinutes?: number
}

/**
 * After a successful fetch the interval follows the last 7 days of output. After a failure
 * the interval stays, and the next try waits twice as long (within the bound) so a dead site
 * is not hammered.
 */
export function afterFetch(args: {
  source: SourceSchedule
  now: Date
  found: number
  itemsLast7Days: number
  error?: string
}): SourcePatch {
  const { source, now, error } = args
  const at = now.toISOString()
  const plusMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()

  if (error) {
    const max = source.use === 'hot_signal' ? HOT_SIGNAL_MAX_MINUTES : INTERVAL_MAX_MINUTES
    return {
      lastFetchedAt: at,
      lastError: error.slice(0, 2000),
      nextFetchAt: plusMinutes(Math.min(source.intervalMinutes * 2, max)),
    }
  }

  const intervalMinutes = nextIntervalMinutes(args.itemsLast7Days, source.use)
  return {
    lastFetchedAt: at,
    lastSuccessAt: at,
    firstFetchedAt: source.firstFetchedAt ?? at,
    lastError: null,
    lastItemCount: args.found,
    itemsLast7Days: args.itemsLast7Days,
    intervalMinutes,
    nextFetchAt: plusMinutes(intervalMinutes),
  }
}
