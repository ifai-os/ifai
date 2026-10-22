import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/** Every cached apps query carries this tag, so one change refreshes every apps page. */
export const appsCacheTag = 'apps'

function refreshAppsPages(req: PayloadRequest) {
  try {
    // Expire now rather than serve one more stale page: an editor checks right after saving.
    revalidateTag(appsCacheTag, { expire: 0 })
  } catch (error) {
    // Scripts and migrations run outside Next.js, where there is no page cache to refresh.
    if (error instanceof Error && error.message.includes('static generation store missing')) return
    req.payload.logger.warn({ err: error }, 'Could not refresh the apps pages')
  }
}

/**
 * Payload hooks for `apps` and `app-categories`. They run inside the save's transaction; a
 * visitor who loads a page in the moment before it commits can cache the old version until
 * the next change.
 */
export const refreshAppsAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refreshAppsPages(req)
  return doc
}

export const refreshAppsAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refreshAppsPages(req)
  return doc
}
