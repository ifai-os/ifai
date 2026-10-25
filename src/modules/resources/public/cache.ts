import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { dataTag } from '@/lib/data-cache'

/** Every cached Skills query carries this tag: one change refreshes the list, the pages and the home page. */
export const skillsCacheTag = 'skills'

/**
 * Expire every cached Skills page now, so publishing, withdrawing and delisting show within the
 * minute (docs/specs/resources.md, 验收标准).
 */
export function refreshSkillsCache(onError: (error: unknown) => void = (error) => console.warn('Could not refresh the Skills pages', error)) {
  try {
    revalidateTag(dataTag(skillsCacheTag), { expire: 0 })
  } catch (error) {
    // Scripts, migrations and background jobs outside a request have no page cache to refresh.
    if (error instanceof Error && error.message.includes('static generation store missing')) return
    onError(error)
  }
}

function refreshSkillsPages(req: PayloadRequest) {
  refreshSkillsCache((error) => req.payload.logger.warn({ err: error }, 'Could not refresh the Skills pages'))
}

/** For `skills`, `skill-versions`, `agent-hosts` and `skill-tags`. */
export const refreshSkillsAfterChange: CollectionAfterChangeHook = ({ doc, req }) => {
  refreshSkillsPages(req)
  return doc
}

export const refreshSkillsAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  refreshSkillsPages(req)
  return doc
}
