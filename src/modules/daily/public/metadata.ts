import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { localizePath, locales, ogLocales, type Locale } from '@/i18n/config'
import { alternatesFor, shareCard } from '@/lib/seo'

import type { StoryCategory } from '../categories'
import type { StoryTag } from '../tags'
import { posterVersion } from '../poster/snapshot'
import { POSTER_SIZE } from '../poster/layout'
import { getPoster, getStory } from './data'
import { feedPath, listHref, posterDay, posterHref, posterImagePath, storyHref } from './list-params'

const descriptionLength = 160

/** Title, description, canonical address and the RSS link of a list page. */
export async function listMetadata({
  locale,
  category,
  tag = null,
  page,
}: {
  locale: Locale
  category: StoryCategory | null
  tag?: StoryTag | null
  page: number
}): Promise<Metadata> {
  const [t, names, tagNames] = await Promise.all([
    getTranslations({ locale, namespace: 'daily' }),
    getTranslations({ locale, namespace: 'categories' }),
    getTranslations({ locale, namespace: 'tags' }),
  ])
  const base = category
    ? t('categoryTitle', { category: names(category) })
    : tag
      ? t('tagTitle', { tag: tagNames(tag) })
      : t('title')
  return {
    title: page > 1 ? t('pageTitle', { title: base, page }) : base,
    description: t('description'),
    alternates: {
      ...alternatesFor(listHref({ category, tag, page }), locale),
      types: { 'application/rss+xml': localizePath(locale, feedPath) },
    },
  }
}

/** Title and description of a story's page from its summary; empty when there is no such story. */
export async function storyMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const story = await getStory(slug, locale)
  if (!story) return {}
  const summary = story.summary?.value.replace(/\s+/g, ' ')

  return {
    title: story.title.value,
    description: summary ? Array.from(summary).slice(0, descriptionLength).join('') : undefined,
    alternates: alternatesFor(storyHref(story.slug), locale),
    ...shareCard(locale, { article: { publishedTime: story.publishedAt, modifiedTime: story.correctedAt } }),
  }
}

/** A poster page: its title and day, the head story in the description, the image as the share picture. */
export async function posterMetadata(date: string, locale: Locale): Promise<Metadata> {
  const snapshot = await getPoster(date)
  if (!snapshot) return {}
  const t = await getTranslations({ locale, namespace: 'poster' })
  const day = posterDay(date, locale)
  const count = snapshot.entries.length
  const title = t('pageTitle', { date: day })
  const image = {
    url: posterImagePath(locale, date, posterVersion(snapshot)),
    width: POSTER_SIZE.width,
    height: POSTER_SIZE.height,
    alt: t('imageAlt', { date: day, count }),
  }
  return {
    title,
    description: t('pageDescription', { date: day, count, head: snapshot.entries[0].title[locale].value }),
    alternates: alternatesFor(posterHref(date), locale),
    openGraph: {
      type: 'article',
      siteName: 'IFAI',
      title,
      locale: ogLocales[locale],
      alternateLocale: locales.filter((item) => item !== locale).map((item) => ogLocales[item]),
      images: [image],
    },
    twitter: { card: 'summary_large_image', images: [image.url] },
  }
}
