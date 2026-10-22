import { getTranslations } from 'next-intl/server'

import { localeFromPathSegment } from '@/i18n/config'
import { siteUrl } from '@/lib/site-url'
import { feedLength, latestStories } from '@/modules/daily/public/data'
import { renderFeed } from '@/modules/daily/public/rss'

type Context = { params: Promise<{ locale: string }> }

/**
 * One RSS feed per language. The stories come from the cache that publishing refreshes; the
 * short CDN cache keeps the feed within a minute of the editor's change.
 */
export async function GET(_request: Request, { params }: Context) {
  // The locale proxy skips paths with a dot, so the segment arrives as written in the URL (/zh-hans).
  const locale = localeFromPathSegment((await params).locale)
  if (!locale) return new Response('Not found', { status: 404 })

  const [stories, t, names] = await Promise.all([
    latestStories(locale, feedLength),
    getTranslations({ locale, namespace: 'daily' }),
    getTranslations({ locale, namespace: 'categories' }),
  ])
  const xml = renderFeed({
    locale,
    stories,
    title: t('feedTitle'),
    description: t('feedDescription'),
    tryItLabel: t('tryIt'),
    categoryName: (category) => names(category),
    origin: siteUrl(),
  })

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
    },
  })
}
