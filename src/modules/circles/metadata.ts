import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { localizePath, type Locale } from '@/i18n/config'
import { shareCard } from '@/lib/seo'

import { getPostPage } from './public'
import { excerpt, postLocale, postPath, postTitleValues } from './rules'

const descriptionLength = 120

/**
 * A post's page (docs/specs/circles.md「/circles/p/[id]」): the title and description from its
 * text, canonical in the language it is written in and without hreflang, its first picture to
 * share. A hidden post, which only its author opens, is not indexed.
 */
export async function postMetadata(id: string, locale: Locale): Promise<Metadata> {
  const page = await getPostPage(id, locale)
  if (!page) return {}
  const { post, circle } = page
  const t = await getTranslations({ locale, namespace: 'circles' })
  const title = t('postTitle', postTitleValues(post, post.author.name || t('anonymous'), circle.name))
  const image = post.images[0]
  return {
    title,
    description: post.body.trim() ? excerpt(post.body, descriptionLength) : title,
    alternates: { canonical: localizePath(postLocale(post), postPath(post.id)) },
    ...(post.hidden && { robots: { index: false } }),
    ...shareCard(locale, { image: image && { url: image.feed }, article: { publishedTime: post.createdAt } }),
  }
}
