import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { localizePath, type Locale } from '@/i18n/config'
import { alternatesFor, shareCard } from '@/lib/seo'

import { getArticle } from './data'
import { articleHref, isPlainList, listHref, plainText, type ListQuery } from './rules'

const descriptionLength = 160

/**
 * The list's title and description. Only the plain first page is indexed; tabs, channels, tags
 * and later pages are the same list filtered (docs/specs/recommend.md「页面与路由」).
 */
export async function listMetadata(locale: Locale, query: ListQuery): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'recommend' })
  const base = query.tag
    ? t('tagTitle', { tag: query.tag })
    : query.channel
      ? t('channelTitle', { channel: t(`channels.${query.channel}`) })
      : t('title')
  return {
    title: query.page > 1 ? t('pageTitle', { title: base, page: query.page }) : base,
    description: t('description'),
    alternates: isPlainList(query) ? alternatesFor(listHref(), locale) : { canonical: localizePath(locale, listHref(query)) },
    ...(!isPlainList(query) && { robots: { index: false, follow: true } }),
  }
}

/**
 * An article's title and description. Its one canonical address is the page in the language it
 * is written in, with no hreflang alternates: the other languages only change the page around
 * it (规则 6).
 */
export async function articleMetadata(id: number): Promise<Metadata> {
  const article = await getArticle(id)
  if (!article) return {}
  const text = (article.summary ?? plainText(article.body)).replace(/\s+/g, ' ').trim()
  return {
    title: article.title,
    description: text ? Array.from(text).slice(0, descriptionLength).join('') : undefined,
    alternates: { canonical: localizePath(article.lang, articleHref(article.id)) },
    ...shareCard(article.lang, {
      image: article.coverFull ? { url: article.coverFull.url, width: article.coverFull.width ?? undefined, height: article.coverFull.height ?? undefined, alt: article.coverFull.alt } : null,
      article: { publishedTime: article.publishedAt, modifiedTime: article.updatedAt },
    }),
  }
}
