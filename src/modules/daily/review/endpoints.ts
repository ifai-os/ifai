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
import { loadReviewQueue } from './queue'

type Body = Record<string, unknown>

async function bodyOf(req: PayloadRequest): Promise<Body> {
  try {
    const data = await req.json?.()
    return data && typeof data === 'object' ? (data as Body) : {}
  } catch {
    return {}
  }
}

function idOf(req: PayloadRequest): number {
  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id)) throw new ReviewError('bad_request', 400, { issues: ['id'] })
  return id
}

function handle(run: (req: PayloadRequest, body: Body) => Promise<unknown>): Endpoint['handler'] {
  return async (req) => {
    if (!req.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
    try {
      const body = req.method?.toUpperCase() === 'POST' ? await bodyOf(req) : {}
      const result = await run(req, body)
      return result === null ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json(result)
    } catch (error) {
      if (error instanceof ReviewError) return Response.json({ error: error.code, detail: error.detail }, { status: error.status })
      console.error('review endpoint failed:', error)
      return Response.json({ error: 'failed', message: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  }
}

const reviewActions = ['edit', 'publish', 'correct', 'reject', 'later', 'withdraw', 'merge', 'keep-separate', 'rewrite', 'assist'] as const

/**
 * The review screen's API on the stories collection (all need a signed-in admin):
 *   GET  /api/stories/review-queue                 the queue, today's published and the summary cards
 *   POST /api/stories/review-queue/retry-source     { sourceId } fetch a failing source now
 *   GET  /api/stories/:id/review                    one story in every language
 *   POST /api/stories/:id/review/<action>           edit | publish | correct | reject | later | withdraw |
 *                                                   merge { into } | keep-separate | rewrite { locales? } | assist { kind, avoid? }
 * Every POST may carry `edits` (title, summary, tryIt, category, sources in zh-Hans), saved first.
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
        case 'publish':
          return publishStory(id, edits)
        case 'correct':
          return correctStory(id, edits)
        case 'reject':
          return rejectStory(id)
        case 'later':
          return laterStory(id, edits)
        case 'withdraw':
          return withdrawStory(id)
        case 'keep-separate':
          return keepSeparate(id)
        case 'merge': {
          const into = Number(body.into)
          if (!Number.isInteger(into)) throw new ReviewError('bad_request', 400, { issues: ['into'] })
          return mergeStory(id, into, edits)
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
