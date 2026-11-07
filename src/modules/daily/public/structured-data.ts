import { homeHref } from '@/config/site'
import type { Locale } from '@/i18n/config'
import { absoluteUrl, breadcrumbs, clip, pageUrl, siteOrganization, type JsonLdObject } from '@/lib/structured-data'
import { defaultShareImage } from '@/lib/seo'

import type { EntityKind } from '../entities'
import { listHref, storyHref } from './list-params'
import type { StoryDetail, StoryItem } from './story-item'

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

/** A list page's stories in its structured data: the first ten, as the page shows them. */
const listedStories = 10

/**
 * A list of stories (a topic's, a tag's, a category's page) as a CollectionPage whose main
 * entity is the list, plus its breadcrumb trail (首页 › 日报 › the page). A topic page says
 * which company or product it is about.
 */
export function storyListJsonLd(
  locale: Locale,
  list: {
    name: string
    path: `/${string}`
    stories: readonly Pick<StoryItem, 'slug' | 'title'>[]
    about?: { kind: EntityKind; name: string }
  },
  labels: { home: string; daily: string },
  home: '/' | '/news' = homeHref(),
): JsonLdObject[] {
  const url = pageUrl(locale, list.path)
  const page: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: list.name,
    url,
    inLanguage: locale,
    isPartOf: { '@type': 'WebSite', name: 'IFAI', url: pageUrl(locale, '/') },
    about: list.about && { '@type': list.about.kind === 'company' ? 'Organization' : list.about.kind === 'product' ? 'Product' : 'Thing', name: list.about.name },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.stories.slice(0, listedStories).map((story, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: pageUrl(locale, storyHref(story.slug)),
        name: story.title.value,
      })),
    },
  }
  return [
    page,
    breadcrumbs(locale, [
      ...(home === '/' ? [{ name: labels.home, path: '/' as const }] : []),
      { name: labels.daily, path: listHref() },
      { name: list.name, path: list.path },
    ]),
  ]
}
