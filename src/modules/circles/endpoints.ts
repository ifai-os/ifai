import type { Endpoint, PayloadRequest } from 'payload'

import { adminPosts, moderatePost, openPostReports, type AdminPost, type OpenPostReport } from './admin'
import { parseId, postStatuses, type PostStatus } from './rules'

export type AdminPostsResponse = { posts: AdminPost[] }
export type OpenPostReportsResponse = { total: number; items: OpenPostReport[] }

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

async function jsonOf(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Back-office endpoints for posts on `circles`, for admins only. */
export const circleEndpoints: Endpoint[] = [
  {
    // GET /api/circles/post-reports — reported posts nobody has dealt with, for the notice above the circles list.
    path: '/post-reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: OpenPostReportsResponse = await openPostReports(req.payload)
      return Response.json(response)
    },
  },
  {
    // GET /api/circles/:id/posts — every post in the circle, for its「动态」tab.
    path: '/:id/posts',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const circleId = parseId(req.routeParams?.id)
      if (!circleId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const response: AdminPostsResponse = { posts: await adminPosts(req.payload, circleId) }
      return Response.json(response)
    },
  },
  {
    // POST /api/circles/:id/posts/:postId { status: 'hidden' | 'shown' } or { keep: true } (the reports were wrong).
    path: '/:id/posts/:postId',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const circleId = parseId(req.routeParams?.id)
      const postId = parseId(req.routeParams?.postId)
      if (!circleId || !postId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const body = await jsonOf(req)
      const status = body.status
      let change: { status: PostStatus } | { keep: true }
      if (typeof status === 'string' && (postStatuses as readonly string[]).includes(status)) {
        change = { status: status as PostStatus }
      } else if (body.keep === true) {
        change = { keep: true }
      } else {
        return Response.json({ error: 'Send JSON: { "status": "hidden" }, { "status": "shown" } or { "keep": true }' }, { status: 400 })
      }
      const ok = await moderatePost(req.payload, circleId, postId, change)
      return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
    },
  },
]
