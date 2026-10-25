import type { Locale } from '@/i18n/config'
import { defaultShareImage } from '@/lib/seo'
import { absoluteUrl, breadcrumbs, clip, pageUrl, siteOrganization, type JsonLdObject } from '@/lib/structured-data'

import type { ArticleDetail } from './list'
import { articleHref, listHref } from './rules'

/** Google shows at most 110 characters of a headline. */
const headlineLength = 110

/**
 * An article as an Article at its canonical address (the page in its own language), plus the
 * breadcrumb trail of the page it is on (首页 › 推荐 › 频道 › 标题). The author is the member who wrote
 * it, by the name it shows (`labels.anonymous` when they have none), or the editors.
 */
export function articleJsonLd(
  article: ArticleDetail,
  locale: Locale,
  labels: { home: string; recommend: string; channel: string; editorial: string; anonymous: string },
): JsonLdObject[] {
  const url = pageUrl(article.lang, articleHref(article.id))
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: clip(article.title, headlineLength),
      description: article.summary,
      inLanguage: article.lang,
      url,
      mainEntityOfPage: url,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      image: [absoluteUrl(article.coverFull?.url ?? defaultShareImage(article.lang).url)],
      articleSection: labels.channel,
      keywords: article.tags.length > 0 ? article.tags.join(', ') : undefined,
      author: article.author
        ? { '@type': 'Person', name: article.author.name || labels.anonymous }
        : { ...siteOrganization(), name: labels.editorial },
      publisher: siteOrganization(),
    },
    breadcrumbs(locale, [
      { name: labels.home, path: '/' },
      { name: labels.recommend, path: listHref() },
      { name: labels.channel, path: listHref({ tab: 'latest', channel: article.channel }) },
      { name: article.title, path: articleHref(article.id) },
    ]),
  ]
}
