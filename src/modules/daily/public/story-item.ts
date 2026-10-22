import type { Locale } from '@/i18n/config'
import { inAnyLanguage, inReaderLanguage, type InLanguage, type Localized } from '@/lib/i18n/localized'
import type { Story } from '@/payload-types'

import { storyCategories, type StoryCategory } from '../categories'
import type { SourceRole } from '../story-fields'

/** What the pages show of a story, in the reader's language (no Payload code: components and tests import this). */

export type StorySource = { name: string; role: SourceRole; url: string; publishedAt: string | null }

export type StoryItem = {
  id: number
  slug: string
  category: StoryCategory
  /** When the editor approved it; the time every page shows and groups by. */
  publishedAt: string
  correctedAt: string | null
  title: InLanguage<string>
  summary: InLanguage<string> | null
  tryIt: InLanguage<string> | null
  /** Other outlets that reported the same happening: the sources with the role "report". */
  moreReports: number
  /** Publisher of the original announcement (or of the first report). */
  originalName: string | null
}

export type StoryDetail = StoryItem & {
  sources: StorySource[]
  /** Other published stories of the same event, newest first. */
  developments: StoryItem[]
}

/** A story as Payload returns it with `locale: 'all'`. */
export type RawStory = Omit<Story, 'title' | 'summary' | 'tryIt'> & {
  title: Localized<string>
  summary: Localized<string>
  tryIt?: Localized<string>
}

export function isStoryCategory(value: string): value is StoryCategory {
  return (storyCategories as readonly string[]).includes(value)
}

export function sourcesOf(doc: Pick<Story, 'sources'>): StorySource[] {
  return (doc.sources ?? []).map(({ name, role, url, publishedAt }) => ({ name, role, url, publishedAt: publishedAt ?? null }))
}

export function toItem(doc: RawStory, locale: Locale): StoryItem {
  const sources = sourcesOf(doc)
  return {
    id: doc.id,
    slug: doc.slug,
    category: isStoryCategory(doc.category) ? doc.category : 'industry',
    publishedAt: doc.publishedAt ?? doc.createdAt,
    correctedAt: doc.correctedAt ?? null,
    // A published story always has English; the last fallback only keeps a broken record from crashing the page.
    title: inAnyLanguage(doc.title, locale) ?? { value: doc.slug, lang: 'en' },
    summary: inReaderLanguage(doc.summary, locale),
    tryIt: inReaderLanguage(doc.tryIt, locale),
    moreReports: sources.filter((source) => source.role === 'report').length,
    originalName: (sources.find((source) => source.role === 'original') ?? sources[0])?.name ?? null,
  }
}
