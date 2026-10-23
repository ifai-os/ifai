import { NextResponse, type NextRequest } from 'next/server'

import { isLocale } from '@/i18n/config'
import { getDb } from '@/lib/db/drizzle'
import { isReviewable } from '@/modules/apps/reviews/data'
import { parseId, type ReviewsError, type ReviewTranslation } from '@/modules/apps/reviews/rules'
import { reviewWithTranslation, translationText } from '@/modules/apps/reviews/translations'

export const dynamic = 'force-dynamic'

// Machine translations of readers' words stay out of search engines (AGENTS.md「多语言约定」).
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers })
}

const fail = (error: ReviewsError, status: number) => reply({ error }, status)

/**
 * GET /api/reviews/translation?review=345&locale=ja → ReviewTranslation: a shown review in the
 * page's language, as the translation job stored it (docs/specs/apps.md 5c), or converted by
 * OpenCC between Simplified and Traditional Chinese. Read only when a reader presses「翻译」.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const reviewId = parseId(params.get('review'))
  const locale = params.get('locale')
  if (!reviewId || !isLocale(locale)) return fail('invalid-request', 400)
  const { payload } = await getDb()
  const review = await reviewWithTranslation(payload, reviewId)
  if (!review || !(await isReviewable(payload, review.appId))) return fail('not-found', 404)
  const text = translationText(review, locale, review.texts)
  if (text === null) return fail('not-translated', 404)
  const body: ReviewTranslation = { review: reviewId, locale, text }
  return reply(body)
}
