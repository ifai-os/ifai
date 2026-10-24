import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/** Every cached Wiki query carries this tag: saving an entry or a topic refreshes every Wiki page. */
export const wikiCacheTag = 'wiki'

/** Expire every cached Wiki page now, so a saved entry shows within the minute (docs/specs/wiki.md, 验收标准). */
export function refreshWikiCache(onError: (error: unknown) => void = (error) => console.warn('Could not refresh the Wiki pages', error)) {
  try {
    revalidateTag(wikiCacheTag, { expire: 0 })
  } catch (error) {
    // Scripts and migrations run outside Next.js, where there is no page cache to refresh.
    if (error instanceof Error && error.message.includes('static generation store missing')) return
    onError(error)
  }
}

function refreshWikiPages(req: PayloadRequest) {
  refreshWikiCache((error) => req.payload.logger.warn({ err: error }, 'Could not refresh the Wiki pages'))
}

/** For `wiki-entries` and `wiki-topics`. */
export const refreshWikiAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refreshWikiPages(req)
  return doc
}

export const refreshWikiAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refreshWikiPages(req)
  return doc
}
