import { NextResponse, type NextRequest } from 'next/server'

import { isLocale } from '@/i18n/config'
import { listStories } from '@/modules/daily/public/data'
import { readPage } from '@/modules/daily/public/list-params'
import { isStoryTag } from '@/modules/daily/tags'

/**
 * GET /api/daily/list?locale=zh-Hans&page=2[&tag=agents] → { stories, page, pages }: what
 * `/daily?page=2` lists, for「加载更多」to add under the stories already shown. The same short CDN
 * cache as the RSS feed; the list pages themselves stay the addresses search engines follow.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const locale = params.get('locale')
  const tag = params.get('tag')
  const page = readPage({ page: params.get('page') ?? '' })
  if (!isLocale(locale) || !page || (tag !== null && !isStoryTag(tag))) {
    return NextResponse.json({ error: 'invalid-request' }, { status: 400 })
  }
  const result = await listStories({ locale, tag, page })
  if (result.stories.length === 0) return NextResponse.json({ error: 'not-found' }, { status: 404 })
  return NextResponse.json(
    { stories: result.stories, page, pages: result.pages },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300', 'X-Robots-Tag': 'noindex' } },
  )
}
