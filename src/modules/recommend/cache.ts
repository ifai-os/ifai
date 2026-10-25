import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { dataTag } from '@/lib/data-cache'

/** Every cached articles query carries this tag, so a save in the back office shows on the pages at once. */
export const articlesCacheTag = 'articles'

export function refreshArticlesCache(onError: (error: unknown) => void = (error) => console.warn('Could not refresh the recommend pages', error)) {
  try {
    revalidateTag(dataTag(articlesCacheTag), { expire: 0 })
  } catch (error) {
    // Scripts and migrations run outside Next.js, where there is no page cache to refresh.
    if (error instanceof Error && error.message.includes('static generation store missing')) return
    onError(error)
  }
}

function refreshArticlePages(req: PayloadRequest) {
  refreshArticlesCache((error) => req.payload.logger.warn({ err: error }, 'Could not refresh the recommend pages'))
}

export const refreshArticlesAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refreshArticlePages(req)
  return doc
}

export const refreshArticlesAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refreshArticlePages(req)
  return doc
}
