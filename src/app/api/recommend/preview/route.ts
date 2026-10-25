import type { NextRequest } from 'next/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { getDb } from '@/lib/db/drizzle'
import { detectLanguage } from '@/lib/i18n/detect'
import { isCrossSite } from '@/lib/same-origin'
import { textLength } from '@/modules/apps/reviews/rules'
import { closed, fail, reply } from '@/modules/recommend/api'
import { previewBody } from '@/modules/recommend/write'
import { cleanMarkdown, writeRules } from '@/modules/recommend/writing'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recommend/preview { markdown, title, locale } → { body, toc, lang }: the writing page's
 *「预览」, made the way a saved article is (docs/specs/recommend.md rule 13), in the language it
 * would be saved in. Members only, from IFAI's own pages.
 */
export async function POST(request: NextRequest) {
  const shut = closed()
  if (shut) return shut
  if (isCrossSite(request)) return fail('cross-site', 403)
  const json = (await request.json().catch(() => null)) as { markdown?: unknown; title?: unknown; locale?: unknown } | null
  const markdown = typeof json?.markdown === 'string' ? cleanMarkdown(json.markdown) : null
  const locale = json?.locale
  if (markdown === null || !isLocale(locale)) return fail('invalid-request', 400)
  const title = typeof json?.title === 'string' ? json.title : ''
  if (textLength(markdown) > writeRules.maxMarkdown) return fail('body-too-long', 400)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return fail('sign-in', 401)
  const { payload } = await getDb()
  const preview = await previewBody(payload, session.user.id, markdown)
  if (!preview.ok) return fail(preview.error, 400)
  const lang = detectLanguage(`${title}\n${markdown}`, locale)
  return reply({ body: preview.body, toc: preview.toc, lang: lang === 'und' ? locale : lang })
}
