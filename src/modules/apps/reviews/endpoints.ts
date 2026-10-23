import type { Endpoint, PayloadRequest } from 'payload'

import { adminReviews, moderateReview, openReports, type AdminReview, type OpenReport } from './admin'
import { parseId, reviewStatuses, type ReviewStatus } from './rules'

export type AdminReviewsResponse = { reviews: AdminReview[] }
export type OpenReportsResponse = { total: number; items: OpenReport[] }

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

async function jsonOf(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Back-office endpoints for reviews on `apps`, for admins only. */
export const reviewEndpoints: Endpoint[] = [
  {
    // GET /api/apps/review-reports — reported reviews nobody has dealt with, for the notice above the apps list.
    path: '/review-reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: OpenReportsResponse = await openReports(req.payload)
      return Response.json(response)
    },
  },
  {
    // GET /api/apps/:id/reviews — every review of the app, for its「评价」tab.
    path: '/:id/reviews',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const appId = parseId(req.routeParams?.id)
      if (!appId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const response: AdminReviewsResponse = { reviews: await adminReviews(req.payload, appId) }
      return Response.json(response)
    },
  },
  {
    // POST /api/apps/:id/reviews/:reviewId { status: 'hidden' | 'shown' } or { keep: true } (the reports were wrong).
    path: '/:id/reviews/:reviewId',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const appId = parseId(req.routeParams?.id)
      const reviewId = parseId(req.routeParams?.reviewId)
      if (!appId || !reviewId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const body = await jsonOf(req)
      const status = body.status
      let change: { status: ReviewStatus } | { keep: true }
      if (typeof status === 'string' && (reviewStatuses as readonly string[]).includes(status)) {
        change = { status: status as ReviewStatus }
      } else if (body.keep === true) {
        change = { keep: true }
      } else {
        return Response.json({ error: 'Send JSON: { "status": "hidden" }, { "status": "shown" } or { "keep": true }' }, { status: 400 })
      }
      const ok = await moderateReview(req.payload, appId, reviewId, change)
      return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
    },
  },
]
