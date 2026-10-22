import { z } from 'zod'

import { cleanText, toDate } from '../text'
import type { FoundItem } from '../types'
import { normalizeUrl } from '../url'

/** Front page via the Algolia API: one request, scores and comment counts included. */
export const HACKER_NEWS_FRONT_PAGE = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30'

/** Stories below this score are not worth a model call; tune after launch. */
export const HACKER_NEWS_MIN_POINTS = 50

const hit = z.object({
  objectID: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  points: z.number().nullish(),
  num_comments: z.number().nullish(),
  created_at: z.string().nullish(),
})

const response = z.object({ hits: z.array(hit.loose()) })

/**
 * Hacker News is a discovery source and a popularity signal: we keep the linked article as
 * the item and the thread as `discussionUrl`. Text posts without a link (Ask HN) are skipped.
 */
export function readHackerNews(json: unknown, { minPoints = HACKER_NEWS_MIN_POINTS } = {}): FoundItem[] {
  const { hits } = response.parse(json)
  const seen = new Set<string>()
  const found: FoundItem[] = []
  for (const story of hits) {
    const points = story.points ?? 0
    if (points < minPoints) continue
    const url = story.url && normalizeUrl(story.url)
    const title = cleanText(story.title, 300)
    if (!url || !title || seen.has(url)) continue
    seen.add(url)
    const item: FoundItem = {
      url,
      title,
      externalId: story.objectID,
      discussionUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(story.objectID)}`,
      signals: { points, comments: story.num_comments ?? 0 },
    }
    const publishedAt = toDate(story.created_at)
    if (publishedAt) item.publishedAt = publishedAt
    found.push(item)
  }
  return found
}
