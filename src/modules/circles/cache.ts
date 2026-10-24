import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/** The cached circles (names, colors, order) carry this tag, so a change in the back office shows at once. */
export const circlesCacheTag = 'circles'

export function refreshCirclesCache(onError: (error: unknown) => void = (error) => console.warn('Could not refresh the circles page', error)) {
  try {
    revalidateTag(circlesCacheTag, { expire: 0 })
  } catch (error) {
    // Scripts and migrations run outside Next.js, where there is no page cache to refresh.
    if (error instanceof Error && error.message.includes('static generation store missing')) return
    onError(error)
  }
}

function refreshCirclesPage(req: PayloadRequest) {
  refreshCirclesCache((error) => req.payload.logger.warn({ err: error }, 'Could not refresh the circles page'))
}

export const refreshCirclesAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refreshCirclesPage(req)
  return doc
}

export const refreshCirclesAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refreshCirclesPage(req)
  return doc
}
