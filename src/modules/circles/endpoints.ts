import type { Endpoint, PayloadRequest } from 'payload'

import {
  adminComments,
  adminPosts,
  moderateComment,
  moderatePost,
  openCommentReports,
  openPostReports,
  type AdminComment,
  type AdminPost,
  type OpenCommentReport,
  type OpenPostReport,
} from './admin'
import { parseId, postStatuses, type PostStatus } from './rules'

export type AdminPostsResponse = { posts: AdminPost[] }
export type AdminCommentsResponse = { comments: AdminComment[] }
export type OpenReportsResponse = {
  posts: { total: number; items: OpenPostReport[] }
  comments: { total: number; items: OpenCommentReport[] }
}

type Change = { status: PostStatus } | { keep: true }

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

async function jsonOf(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** { status: 'hidden' | 'shown' } or { keep: true } (the reports were wrong). */
async function changeOf(req: PayloadRequest): Promise<Change | null> {
  const body = await jsonOf(req)
  const status = body.status
  if (typeof status === 'string' && (postStatuses as readonly string[]).includes(status)) return { status: status as PostStatus }
  return body.keep === true ? { keep: true } : null
}

const badChange = () => Response.json({ error: 'Send JSON: { "status": "hidden" }, { "status": "shown" } or { "keep": true }' }, { status: 400 })

/** Back-office endpoints for posts and comments on `circles`, for admins only. */
export const circleEndpoints: Endpoint[] = [
  {
    // GET /api/circles/open-reports — reported posts and comments nobody has dealt with, for the notice above the circles list.
    path: '/open-reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const [posts, comments] = await Promise.all([openPostReports(req.payload), openCommentReports(req.payload)])
      const response: OpenReportsResponse = { posts, comments }
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
      const change = await changeOf(req)
      if (!change) return badChange()
      const ok = await moderatePost(req.payload, circleId, postId, change)
      return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
    },
  },
  {
    // GET /api/circles/:id/comments — the circle's latest comments, for its「评论」tab.
    path: '/:id/comments',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const circleId = parseId(req.routeParams?.id)
      if (!circleId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const response: AdminCommentsResponse = { comments: await adminComments(req.payload, circleId) }
      return Response.json(response)
    },
  },
  {
    // POST /api/circles/:id/comments/:commentId { status: 'hidden' | 'shown' } or { keep: true }.
    path: '/:id/comments/:commentId',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const circleId = parseId(req.routeParams?.id)
      const commentId = parseId(req.routeParams?.commentId)
      if (!circleId || !commentId) return Response.json({ error: 'Bad id' }, { status: 400 })
      const change = await changeOf(req)
      if (!change) return badChange()
      const ok = await moderateComment(req.payload, circleId, commentId, change)
      return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 })
    },
  },
]
