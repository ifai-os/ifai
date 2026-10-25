import { pageUrl, type JsonLdObject } from '@/lib/structured-data'

import type { ProfilePageData } from './public'
import { profileLocale, profilePath } from './rules'

const counter = (interactionType: string, count: number) => ({
  '@type': 'InteractionCounter',
  interactionType: `https://schema.org/${interactionType}`,
  userInteractionCount: count,
})

/**
 * A member's page as a ProfilePage (docs/specs/circles.md「/u/[handle]」): when they joined, and
 * the Person with their name, address, line about themselves, site, followers, posts and how many
 * people they follow. Only what the page itself shows (src/lib/structured-data.tsx).
 */
export function profileJsonLd({ profile, follows, stats }: ProfilePageData, labels: { anonymous: string }): JsonLdObject {
  const url = pageUrl(profileLocale(profile), profilePath(profile.handle))
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    dateCreated: profile.joinedAt,
    mainEntity: {
      '@type': 'Person',
      name: profile.name || labels.anonymous,
      alternateName: `@${profile.handle}`,
      identifier: profile.handle,
      description: profile.bio,
      url,
      sameAs: profile.website,
      interactionStatistic: [counter('FollowAction', follows.followers), counter('WriteAction', stats.posts)],
      agentInteractionStatistic: counter('FollowAction', follows.following),
    },
  }
}
