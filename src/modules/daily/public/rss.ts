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
  categoryName: (category: StoryCategory) => string
  /** Absolute origin of the site, without a trailing slash. */
  origin: string
}

/** One language's RSS 2.0 feed of the newest published stories, each linking to its page. */
export function renderFeed({ locale, stories, title, description, categoryName, origin }: FeedInput): string {
  const absolute = (pathname: string) => `${origin}${localizePath(locale, pathname)}`
  const updatedAt = stories.map((story) => story.correctedAt ?? story.publishedAt).sort().at(-1)

  return generateRssFeed({
    title,
    link: absolute('/news'),
    description,
    language: locale.toLowerCase(),
    lastBuildDate: updatedAt ? new Date(updatedAt) : undefined,
    generator: 'IFAI',
    ttl: 15,
    atom: { links: [{ href: absolute(feedPath), rel: 'self', type: 'application/rss+xml' }] },
    items: stories.map((story) => {
      const link = absolute(storyHref(story.slug))
      return {
        title: story.title.value,
        link,
        guid: { value: link, isPermaLink: true },
        pubDate: new Date(story.publishedAt),
        description: story.summary?.value || undefined,
        categories: [{ name: categoryName(story.category) }],
      }
    }),
  })
}
