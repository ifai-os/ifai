import type { SitemapPage } from '@/lib/sitemap'

import { isStoryTag, type StoryTag } from '../tags'
import { listHref, readTopicKey, topicHref } from './list-params'

/** What a published story contributes to the tag and topic pages of the sitemap. */
export type StoryForSitemap = {
  /** When it went up on the site (or was last corrected). */
  upAt: string | null | undefined
  tags?: readonly string[] | null
  entities?: readonly { key?: string | null }[] | null
}

/**
 * A topic page is kept out of search engines while only one story is about it (./metadata.ts
 * `topicMetadata`), so only topics of two stories or more are listed.
 */
export const minTopicStories = 2

function later(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return a > b ? a : b
}

/**
 * The industry tags' pages (`/news/tag/<tag>`) that have a published story, and the topic pages
 * (`/news/topic/<key>`) of at least `minTopicStories` stories, each dated by its newest story.
 * Topics come most stories first, so the busiest stay in the first file as the list grows.
 */
export function tagAndTopicPages(stories: readonly StoryForSitemap[]): { tags: SitemapPage[]; topics: SitemapPage[] } {
  const tags = new Map<StoryTag, string | null>()
  const topics = new Map<string, { count: number; lastModified: string | null }>()
  for (const story of stories) {
    for (const tag of new Set(story.tags ?? [])) {
      if (isStoryTag(tag)) tags.set(tag, later(tags.get(tag), story.upAt))
    }
    // Only keys a topic page answers for (readTopicKey), each once per story.
    const keys = new Set((story.entities ?? []).flatMap((entity) => (entity.key && readTopicKey(entity.key) === entity.key ? [entity.key] : [])))
    for (const key of keys) {
      const topic = topics.get(key)
      topics.set(key, { count: (topic?.count ?? 0) + 1, lastModified: later(topic?.lastModified, story.upAt) })
    }
  }
  return {
    tags: [...tags].map(([tag, lastModified]) => ({ path: listHref({ tag }), lastModified })),
    topics: [...topics]
      .filter(([, topic]) => topic.count >= minTopicStories)
      .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
      .map(([key, topic]) => ({ path: topicHref(key), lastModified: topic.lastModified })),
  }
}
