import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { dataTag } from '@/lib/data-cache'

/** Every cached rankings query carries this tag, so a new snapshot or an edit refreshes every rankings page. */
export const rankingsCacheTag = 'rankings'

/** Expire the cached rankings pages now: the weekly job's new snapshot, an arena or model saved in the back office. */
export function refreshRankingsCache(onError: (error: unknown) => void = (error) => console.warn('Could not refresh the rankings pages', error)) {
  try {
    revalidateTag(dataTag(rankingsCacheTag), { expire: 0 })
  } catch (error) {
    // Scripts and migrations run outside Next.js, where there is no page cache to refresh.
    if (error instanceof Error && error.message.includes('static generation store missing')) return
    onError(error)
  }
}

function refreshRankingsPages(req: PayloadRequest) {
  refreshRankingsCache((error) => req.payload.logger.warn({ err: error }, 'Could not refresh the rankings pages'))
}

/** Payload hooks for `arenas` and `arena-models`, whose names and settings the pages show. */
export const refreshRankingsAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refreshRankingsPages(req)
  return doc
}

export const refreshRankingsAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refreshRankingsPages(req)
  return doc
}
