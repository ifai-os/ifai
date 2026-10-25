import type { NextRequest } from 'next/server'

import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { detectLanguage } from '@/lib/i18n/detect'
import { isCrossSite } from '@/lib/same-origin'
import { fail, notLaunched, reply } from '@/modules/circles/api'
import { commentsPage, createComment, deleteComment, threadReplies } from '@/modules/circles/comments'
import { circlesLaunched, shownCircleIds } from '@/modules/circles/public'
import { parseCommentInput, parseId, type CommentChange, type CommentsPage, type RepliesPage } from '@/modules/circles/rules'

// Per reader and always current: never rendered ahead or kept by the browser or a CDN.
export const dynamic = 'force-dynamic'

/**
 * GET /api/circles/comments?post=45[&cursor=…] → CommentsPage: 20 comments, newest first, each
 * with its first replies. With `&thread=12`, the replies under that comment instead, oldest
 * first (RepliesPage). 404 when readers cannot see the post (docs/specs/circles.md rule 15).
 */
export async function GET(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  const params = request.nextUrl.searchParams
  const postId = parseId(params.get('post'))
  const threadId = params.has('thread') ? parseId(params.get('thread')) : null
  const cursor = params.has('cursor') ? parseId(params.get('cursor')) : null
  if (!postId || (params.has('thread') && !threadId) || (params.has('cursor') && !cursor)) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  const userId = session?.user.id ?? null
  const { payload } = await getDb()
  const query = { postId, circleIds: await shownCircleIds(), userId, cursor }
  if (threadId) {
    const replies = await threadReplies(payload, { ...query, threadId })
    if (!replies) return fail('not-found', 404)
    const body: RepliesPage = replies
    return reply(body)
  }
  const page = await commentsPage(payload, query)
  if (!page) return fail('not-found', 404)
  const body: CommentsPage = { signedIn: Boolean(session), ...page }
  return reply(body)
}

const refusals = { 'not-found': 404, 'daily-limit': 429, 'invalid-reply': 422 } as const

/**
 * POST /api/circles/comments { post, body, locale, replyTo? } → CommentChange: the comment and
 * the post's new count. Members only, from IFAI's own pages, on a post readers can see; at most
 * 50 a day (429). `replyTo` must be a comment everyone can see on the same post (422).
 */
export async function POST(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const parsed = parseCommentInput(await request.json().catch(() => null))
  if (!parsed.ok) return fail(parsed.error, 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { post, body, locale, replyTo } = parsed.value
  const { payload } = await getDb()
  const result = await createComment(
    payload,
    { postId: post, userId: session.user.id, body, lang: detectLanguage(body, locale), replyTo },
    await shownCircleIds(),
  )
  if (result.status !== 'created') return fail(result.status, refusals[result.status])
  const response: CommentChange = { comment: result.comment, count: result.count }
  return reply(response)
}

/** DELETE /api/circles/comments?id=31 → { count }: the member's own comment is gone, with the replies under it. */
export async function DELETE(request: NextRequest) {
  if (!circlesLaunched()) return notLaunched()
  if (isCrossSite(request)) return fail('cross-site', 403)
  const commentId = parseId(request.nextUrl.searchParams.get('id'))
  if (!commentId) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const deleted = await deleteComment(payload, commentId, session.user.id)
  if (!deleted) return fail('not-found', 404)
  return reply({ count: deleted.count })
}
