import type { Endpoint, PayloadRequest } from 'payload'

import { inngest } from '@/lib/inngest/client'

import { assistKinds, type AssistKind } from '../prompts/assist'
import {
  ReviewError,
  correctStory,
  keepSeparate,
  laterStory,
  mergeStory,
  parseEdits,
  parseLocales,
  publishStory,
  rejectStory,
  rewriteLocales,
  saveEdits,
  suggest,
  withdrawStory,
} from './actions'
import { loadReviewDetail } from './detail'
import { handle } from './handler'
import { loadReviewQueue } from './queue'

function idOf(req: PayloadRequest): number {
  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id)) throw new ReviewError('bad_request', 400, { issues: ['id'] })
  return id
}

const reviewActions = ['edit', 'publish', 'correct', 'reject', 'later', 'withdraw', 'merge', 'keep-separate', 'rewrite', 'assist'] as const

export type StoryChange = 'published' | 'corrected' | 'withdrawn' | 'merged'

/**
 * `daily/story.changed` { storyId, change }: a story went on or off the site, or its text or
 * sources changed, so other modules can follow at once (the apps pages match stories to apps).
 * The editor's action has already succeeded; a failed send only delays them to their own run.
 */
async function announce(storyId: number, change: StoryChange): Promise<void> {
  try {
    await inngest.send({ name: 'daily/story.changed', data: { storyId, change } })
  } catch (error) {
    console.warn('daily/story.changed not sent:', error instanceof Error ? error.message : error)
  }
}

/**
 * The review screen's API on the stories collection (all need a signed-in admin):
 *   GET  /api/stories/review-queue                 the queue, today's poster (../poster/desk.ts) and the summary cards
 *   POST /api/stories/review-queue/retry-source     { sourceId } fetch a failing source now
 *   GET  /api/stories/:id/review                    one story in every language
 *   POST /api/stories/:id/review/<action>           edit | publish | correct | reject | later | withdraw |
 *                                                   merge { into } | keep-separate | rewrite { locales? } | assist { kind, avoid? }
 * Every POST may carry `edits` (title, summary, tryIt, category, sources in zh-Hans), saved first.
 * Publishing, correcting, withdrawing and merging also send `daily/story.changed`.
 */
export const reviewEndpoints: Endpoint[] = [
  { path: '/review-queue', method: 'get', handler: handle(() => loadReviewQueue()) },
  {
    path: '/review-queue/retry-source',
    method: 'post',
    handler: handle(async (_req, body) => {
      const sourceId = Number(body.sourceId)
      if (!Number.isInteger(sourceId)) throw new ReviewError('bad_request', 400, { issues: ['sourceId'] })
      await inngest.send({ name: 'daily/source.fetch', data: { sourceId } })
      return { ok: true }
    }),
  },
  { path: '/:id/review', method: 'get', handler: handle((req) => loadReviewDetail(idOf(req))) },
  {
    path: '/:id/review/:action',
    method: 'post',
    handler: handle(async (req, body) => {
      const id = idOf(req)
      const action = String(req.routeParams?.action) as (typeof reviewActions)[number]
      if (!reviewActions.includes(action)) throw new ReviewError('bad_request', 400, { issues: ['action'] })
      const edits = parseEdits(body.edits)
      switch (action) {
        case 'edit':
          await saveEdits(id, edits)
          return loadReviewDetail(id)
        case 'publish': {
          const detail = await publishStory(id, edits)
          await announce(id, 'published')
          return detail
        }
        case 'correct': {
          const detail = await correctStory(id, edits)
          await announce(id, 'corrected')
          return detail
        }
        case 'reject':
          return rejectStory(id)
        case 'later':
          return laterStory(id, edits)
        case 'withdraw': {
          const detail = await withdrawStory(id)
          await announce(id, 'withdrawn')
          return detail
        }
        case 'keep-separate':
          return keepSeparate(id)
        case 'merge': {
          const into = Number(body.into)
          if (!Number.isInteger(into)) throw new ReviewError('bad_request', 400, { issues: ['into'] })
          const result = await mergeStory(id, into, edits)
          await announce(result.target.id, 'merged')
          return result
        }
        case 'rewrite': {
          await rewriteLocales(id, parseLocales(body.locales))
          return loadReviewDetail(id)
        }
        case 'assist': {
          const kind = body.kind as AssistKind
          if (!assistKinds.includes(kind)) throw new ReviewError('bad_request', 400, { issues: ['kind'] })
          const avoid = Array.isArray(body.avoid) ? body.avoid.filter((item): item is string => typeof item === 'string').slice(0, 5) : []
          return { text: await suggest(id, kind, edits, avoid) }
        }
      }
    }),
  },
]
