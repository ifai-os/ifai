import type { Locale } from '@/i18n/config'
import { breadcrumbs, pageUrl, siteOrganization, type JsonLdObject } from '@/lib/structured-data'

import type { EntryDetail } from './data'
import { entryHref, topicHref, wikiHref } from './links'

/**
 * An entry's page as a schema.org DefinedTerm in the「IFAI Wiki」term set, plus its breadcrumb
 * trail (首页 › Wiki › 主题 › 条目). Only what the page shows: the name, the aliases, the
 * one-sentence definition and the dates.
 */
export function entryJsonLd(entry: EntryDetail, locale: Locale, labels: { home: string; wiki: string }): JsonLdObject[] {
  const url = pageUrl(locale, entryHref(entry.slug))
  const aliases = entry.otherNames.map((name) => name.value)
  const term: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: entry.title.value,
    alternateName: aliases.length > 0 ? aliases : undefined,
    description: entry.definition?.value,
    url,
    mainEntityOfPage: url,
    inLanguage: entry.title.lang,
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'IFAI Wiki', url: pageUrl(locale, wikiHref) },
    datePublished: entry.publishedAt ?? undefined,
    dateModified: entry.updatedAt,
    publisher: siteOrganization(),
  }
  const topic = entry.topics[0]
  return [
    term,
    breadcrumbs(locale, [
      { name: labels.home, path: '/' },
      { name: labels.wiki, path: wikiHref },
      ...(topic ? [{ name: topic.name.value, path: topicHref(topic.slug) }] : []),
      { name: entry.title.value, path: entryHref(entry.slug) },
    ]),
  ]
}

/** A topic's page: its breadcrumb trail (首页 › Wiki › 主题). */
export function topicJsonLd(topic: { slug: string; name: string }, locale: Locale, labels: { home: string; wiki: string }): JsonLdObject[] {
  return [
    breadcrumbs(locale, [
      { name: labels.home, path: '/' },
      { name: labels.wiki, path: wikiHref },
      { name: topic.name, path: topicHref(topic.slug) },
    ]),
  ]
}
