import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { localizePath, type Locale } from '@/i18n/config'
import { alternatesFor } from '@/lib/seo'

import type { StoryCategory } from '../categories'
import { getStory } from './data'
import { feedPath, listHref, storyHref } from './list-params'

const descriptionLength = 160

/** Title, description, canonical address and the RSS link of a list page. */
export async function listMetadata({
  locale,
  category,
  page,
}: {
  locale: Locale
  category: StoryCategory | null
  page: number
}): Promise<Metadata> {
  const [t, names] = await Promise.all([
    getTranslations({ locale, namespace: 'daily' }),
    getTranslations({ locale, namespace: 'categories' }),
  ])
  const base = category ? t('categoryTitle', { category: names(category) }) : t('title')
  return {
    title: page > 1 ? t('pageTitle', { title: base, page }) : base,
    description: t('description'),
    alternates: {
      ...alternatesFor(listHref({ category, page }), locale),
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
    openGraph: {
      type: 'article',
      publishedTime: story.publishedAt,
      modifiedTime: story.correctedAt ?? undefined,
    },
  }
}
