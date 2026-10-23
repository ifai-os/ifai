import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { keepingRequest } from '@/lib/i18n/hant-sync'
import type { Story } from '@/payload-types'

import { joinPoster, leavePoster } from './desk'

// The poster follows a story going on or off the site, however that happens (the review
// screen, the collection's edit view). A failure is logged, never blocks the change itself.
// The calls share the save's `req` (one transaction); keepingRequest undoes what they change on it.

export const followPublishing: CollectionAfterChangeHook<Story> = async ({ doc, previousDoc, req }) => {
  const was = previousDoc?.status === 'published'
  const is = doc.status === 'published'
  try {
    if (is && !was) await keepingRequest(req, () => joinPoster(req.payload, doc, req))
    else if (was && !is) await keepingRequest(req, () => leavePoster(req.payload, previousDoc, req))
  } catch (error) {
    req.payload.logger.error({ err: error, msg: `daily poster not updated for story ${doc.id}` })
  }
  return doc
}

export const leaveOnDelete: CollectionAfterDeleteHook<Story> = async ({ doc, req }) => {
  if (doc.status !== 'published') return doc
  try {
    await keepingRequest(req, () => leavePoster(req.payload, doc, req))
  } catch (error) {
    req.payload.logger.error({ err: error, msg: `daily poster not updated for deleted story ${doc.id}` })
  }
  return doc
}
