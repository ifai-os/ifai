import { homeHref } from '@/config/site'
import type { Locale } from '@/i18n/config'
import { absoluteUrl, breadcrumbs, clip, pageUrl, siteOrganization, type JsonLdObject } from '@/lib/structured-data'
import { defaultShareImage } from '@/lib/seo'

import { listHref, storyHref } from './list-params'
import type { StoryDetail } from './story-item'

/** Google shows at most 110 characters of a headline. */
const headlineLength = 110

/**
 * A story's page as a NewsArticle, plus its breadcrumb trail (首页 › 日报 › 分类 › 标题). Dates
 * are the ones the page shows: when the editor published it, and the last correction. The image
 * is the story's own picture (or its video's cover), else the site's share picture. While the
 * home page goes to the daily (src/config/site.ts `homeHref`), the trail starts at 日报 instead of
 * linking to an address that only redirects there.
 */
export function storyJsonLd(
  story: StoryDetail,
  locale: Locale,
  labels: { home: string; daily: string; category: string },
  home: '/' | '/news' = homeHref(),
): JsonLdObject[] {
  const url = pageUrl(locale, storyHref(story.slug))
  const original = story.sources.find((source) => source.role === 'original') ?? story.sources[0]
  const article: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: clip(story.title.value, headlineLength),
    description: story.summary?.value,
    articleBody: story.body?.value.map((block) => block.text).join('\n\n'),
    inLanguage: story.title.lang,
    url,
    mainEntityOfPage: url,
    datePublished: story.publishedAt,
    dateModified: story.correctedAt ?? story.publishedAt,
    image: [absoluteUrl(story.media?.picture?.url ?? defaultShareImage(locale).url)],
    articleSection: labels.category,
    author: siteOrganization(),
    publisher: siteOrganization(),
    isBasedOn: original?.url,
  }
  return [
    article,
    breadcrumbs(locale, [
      ...(home === '/' ? [{ name: labels.home, path: '/' as const }] : []),
      { name: labels.daily, path: listHref() },
      { name: labels.category, path: listHref({ category: story.category }) },
      { name: story.title.value, path: storyHref(story.slug) },
    ]),
  ]
}
