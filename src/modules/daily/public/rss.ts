import { generateRssFeed } from 'feedsmith'

import { localizePath, type Locale } from '@/i18n/config'

import type { StoryCategory } from '../categories'
import { feedPath, storyHref } from './list-params'
import type { StoryItem } from './story-item'

export type FeedInput = {
  locale: Locale
  /** Newest first. */
  stories: StoryItem[]
  title: string
  description: string
  tryItLabel: string
  categoryName: (category: StoryCategory) => string
  /** Absolute origin of the site, without a trailing slash. */
  origin: string
}

/** One language's RSS 2.0 feed of the newest published stories, each linking to its page. */
export function renderFeed({ locale, stories, title, description, tryItLabel, categoryName, origin }: FeedInput): string {
  const absolute = (pathname: string) => `${origin}${localizePath(locale, pathname)}`
  const updatedAt = stories.map((story) => story.correctedAt ?? story.publishedAt).sort().at(-1)

  return generateRssFeed({
    title,
    link: absolute('/daily'),
    description,
    language: locale.toLowerCase(),
    lastBuildDate: updatedAt ? new Date(updatedAt) : undefined,
    generator: 'IFAI',
    ttl: 15,
    atom: { links: [{ href: absolute(feedPath), rel: 'self', type: 'application/rss+xml' }] },
    items: stories.map((story) => {
      const link = absolute(storyHref(story.slug))
      const parts = [story.summary?.value, story.tryIt ? `${tryItLabel}: ${story.tryIt.value}` : null]
      return {
        title: story.title.value,
        link,
        guid: { value: link, isPermaLink: true },
        pubDate: new Date(story.publishedAt),
        description: parts.filter((part): part is string => Boolean(part)).join('\n\n') || undefined,
        categories: [{ name: categoryName(story.category) }],
      }
    }),
  })
}
