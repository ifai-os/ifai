import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { alternatesFor, shareCard } from '@/lib/seo'
import { clip } from '@/lib/structured-data'

import { getEntry, getTopic } from './data'
import { entriesHref, entryHref, topicHref, wikiHref } from './links'
import type { EntryType } from './rules'

const descriptionLength = 160

export async function wikiMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'wiki' })
  return { title: t('title'), description: t('description'), alternates: alternatesFor(wikiHref, locale) }
}

/** A topic's page, described by its introduction. */
export async function topicMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const topic = await getTopic(slug, locale)
  if (!topic) return {}
  const t = await getTranslations({ locale, namespace: 'wiki' })
  return {
    title: t('topicTitle', { topic: topic.name.value }),
    description: topic.intro ? clip(topic.intro.value, descriptionLength) : t('description'),
    alternates: alternatesFor(topicHref(topic.slug), locale),
  }
}

/** 全部条目: one type only is the same list filtered, followed but not indexed. */
export async function entriesMetadata(locale: Locale, { type, page }: { type: EntryType | null; page: number }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'wiki' })
  const base = type ? t('entriesTypeTitle', { type: t(`typesPlural.${type}`) }) : t('entriesTitle')
  const title = page > 1 ? t('pageTitle', { title: base, page }) : base
  if (type) return { title, robots: { index: false, follow: true } }
  return { title, description: t('description'), alternates: alternatesFor(entriesHref({ page }), locale) }
}

/** An entry's page: its name, and its one-sentence definition as the description. */
export async function entryMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const entry = await getEntry(slug, locale)
  if (!entry) return {}
  const t = await getTranslations({ locale, namespace: 'wiki' })
  return {
    title: t('entryTitle', { title: entry.title.value }),
    description: entry.definition ? clip(entry.definition.value, descriptionLength) : undefined,
    alternates: alternatesFor(entryHref(entry.slug), locale),
    ...shareCard(locale, {
      article: { publishedTime: entry.publishedAt ?? entry.updatedAt, modifiedTime: entry.updatedAt },
    }),
  }
}
