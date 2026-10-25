import type { NextRequest } from 'next/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { isCrossSite } from '@/lib/same-origin'
import { closed, fail, reply, saveStatus } from '@/modules/recommend/api'
import { deleteOwnArticle, saveArticle } from '@/modules/recommend/write'
import { parseArticleInput, parseId } from '@/modules/recommend/writing'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recommend/articles { title, summary, channel, tags, markdown, cover, publish, locale }
 * → { id, status }: a member's new article, a draft or published (docs/specs/recommend.md rules
 * 12–15). PATCH …?id=12 with the same saves one of their own. Members only, from IFAI's own pages;
 * the 11th new article of the day is 429, a hidden one cannot be changed (409).
 */
async function save(request: NextRequest, id: number | null) {
  const shut = closed()
  if (shut) return shut
  if (isCrossSite(request)) return fail('cross-site', 403)
  const json: unknown = await request.json().catch(() => null)
  const parsed = parseArticleInput(json)
  if (!parsed.ok) return fail(parsed.error, 400)
  const locale = (json as { locale?: unknown }).locale
  if (!isLocale(locale)) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const result = await saveArticle(payload, session.user.id, parsed.value, { id, locale })
  if (!result.ok) return fail(result.error, saveStatus[result.error] ?? 400)
  return reply({ id: result.id, status: result.status })
}

export async function POST(request: NextRequest) {
  return save(request, null)
}

export async function PATCH(request: NextRequest) {
  const id = parseId(request.nextUrl.searchParams.get('id'))
  if (!id) return fail('invalid-request', 400)
  return save(request, id)
}

/** DELETE /api/recommend/articles?id=12 → { deleted: true }: one of the member's own, with its pictures. */
export async function DELETE(request: NextRequest) {
  const shut = closed()
  if (shut) return shut
  if (isCrossSite(request)) return fail('cross-site', 403)
  const id = parseId(request.nextUrl.searchParams.get('id'))
  if (!id) return fail('invalid-request', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  if (!(await deleteOwnArticle(payload, session.user.id, id))) return fail('not-found', 404)
  return reply({ deleted: true })
}
