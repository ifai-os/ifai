import type { Payload } from 'payload'

import { candidateOf, pickByImportance } from '../poster/rules'
import { entryOf, type PosterEntry } from '../poster/snapshot'
import type { RawStory } from '../public/story-item'

/**
 * What the morning email carries (docs/specs/daily-email.md rule 6): the stories approved in the
 * 24 hours before the send and still published, one per event, most important first (as the
 * poster picks, without its limit per source), ten at most. Only news of the last 48 hours by
 * its source's time: an older story put on the site late is not news to send. Read at send
 * time, so a corrected story goes out corrected and a withdrawn one not at all.
 */
export const DIGEST_MAX = 10
const WINDOW_MS = 24 * 3_600_000
const NEWS_MS = 48 * 3_600_000

/** One story in all five languages, as the poster freezes it: the job reads them once and every language uses them. */
export type DigestStory = PosterEntry

/** The stories, in order, from what was approved in the window. */
export function pickDigest(stories: readonly RawStory[]): DigestStory[] {
  const byId = new Map(stories.map((story) => [story.id, story]))
  return pickByImportance(stories.map(candidateOf), { max: DIGEST_MAX }).map((id) => entryOf(byId.get(id)!))
}

export async function digestStories(payload: Payload, now: Date): Promise<DigestStory[]> {
  const { docs } = await payload.find({
    collection: 'stories',
    where: {
      and: [
        { status: { equals: 'published' } },
        { approvedAt: { greater_than_equal: new Date(now.getTime() - WINDOW_MS).toISOString() } },
        { approvedAt: { less_than: now.toISOString() } },
        { publishedAt: { greater_than_equal: new Date(now.getTime() - NEWS_MS).toISOString() } },
      ],
    },
    locale: 'all',
    depth: 0,
    pagination: false,
    limit: 1000,
    overrideAccess: true,
  })
  return pickDigest(docs as unknown as RawStory[])
}
