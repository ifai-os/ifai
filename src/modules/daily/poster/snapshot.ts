/**
 * What a generated poster shows, frozen when the editor generates it: the five images and
 * the poster page are drawn from this, so later corrections reach them only through「重新生成」
 * (a withdrawn story is taken off at once, see ./desk.ts). Pure; no Payload code.
 */
import { locales, type Locale } from '@/i18n/config'
import { inAnyLanguage, inReaderLanguage, type InLanguage } from '@/lib/i18n/localized'

import { storyCategoryOf, type StoryCategory } from '../categories'
import type { RawStory } from '../public/story-item'

export type PosterEntry = {
  id: number
  slug: string
  category: StoryCategory
  /** Publisher of the original announcement (or of the first report). */
  source: string | null
  publishedAt: string
  /** Per poster language: the text and the language it is in (English where that language is missing). */
  title: Record<Locale, InLanguage<string>>
  summary: Record<Locale, InLanguage<string> | null>
}

export type PosterSnapshot = {
  date: string
  generatedAt: string
  /** When the images last changed: generated, or a withdrawn story taken off. */
  updatedAt: string
  entries: PosterEntry[]
}

export function originalSource(doc: Pick<RawStory, 'sources'>): string | null {
  const sources = doc.sources ?? []
  return (sources.find((source) => source.role === 'original') ?? sources[0])?.name ?? null
}

function perLocale<T>(read: (locale: Locale) => T): Record<Locale, T> {
  return Object.fromEntries(locales.map((locale) => [locale, read(locale)])) as Record<Locale, T>
}

/** One story as the poster shows it, read with `locale: 'all'`. */
export function entryOf(doc: RawStory): PosterEntry {
  return {
    id: doc.id,
    slug: doc.slug,
    category: storyCategoryOf(doc.category),
    source: originalSource(doc),
    publishedAt: doc.publishedAt ?? doc.createdAt,
    title: perLocale((locale) => inAnyLanguage(doc.title, locale) ?? { value: doc.slug, lang: 'en' }),
    summary: perLocale((locale) => inReaderLanguage(doc.summary, locale)),
  }
}

function isText(value: unknown): value is InLanguage<string> {
  return Boolean(value) && typeof (value as InLanguage<string>).value === 'string' && locales.includes((value as InLanguage<string>).lang)
}

function isEntry(value: unknown): value is PosterEntry {
  const entry = value as PosterEntry
  return (
    Boolean(entry) &&
    Number.isInteger(entry.id) &&
    typeof entry.slug === 'string' &&
    typeof entry.category === 'string' &&
    typeof entry.publishedAt === 'string' &&
    Boolean(entry.title) &&
    Boolean(entry.summary) &&
    locales.every((locale) => isText(entry.title[locale]) && (entry.summary[locale] === null || isText(entry.summary[locale])))
  )
}

/**
 * The snapshot stored on a poster, or null when it is missing or not in this shape. Posters
 * generated before the categories changed keep their frozen entries; those read as the new ones.
 */
export function readSnapshot(value: unknown): PosterSnapshot | null {
  const snapshot = value as PosterSnapshot
  if (!snapshot || typeof snapshot !== 'object') return null
  if (typeof snapshot.date !== 'string' || typeof snapshot.generatedAt !== 'string' || typeof snapshot.updatedAt !== 'string') return null
  if (!Array.isArray(snapshot.entries)) return null
  if (!snapshot.entries.every(isEntry)) return null
  return { ...snapshot, entries: snapshot.entries.map((entry) => ({ ...entry, category: storyCategoryOf(entry.category) })) }
}

/** Changes whenever the images change; added to image links so browsers and apps fetch the new ones. */
export function posterVersion(snapshot: Pick<PosterSnapshot, 'updatedAt'>): string {
  return Date.parse(snapshot.updatedAt).toString(36)
}
