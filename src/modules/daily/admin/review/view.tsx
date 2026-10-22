import type { AdminViewServerProps } from 'payload'

import { Gutter } from '@payloadcms/ui'

import { loadReviewQueue } from '../../review/queue'
import { ReviewScreen } from './screen'

/**
 * /admin/collections/stories/review — the review queue (「IFAI 日报审核后台」board). Payload
 * wraps it in the admin shell; the queue is loaded here so the first paint has it, then the
 * client screen talks to the review endpoints.
 */
export async function ReviewQueueView({ searchParams }: AdminViewServerProps) {
  const initial = await loadReviewQueue()
  const wanted = Number(Array.isArray(searchParams?.story) ? searchParams.story[0] : searchParams?.story)
  return (
    <Gutter>
      <ReviewScreen initial={initial} initialStoryId={Number.isInteger(wanted) ? wanted : undefined} />
    </Gutter>
  )
}
