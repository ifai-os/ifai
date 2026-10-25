import { entityKey } from '@/modules/daily/entities'
import { isStoryTag } from '@/modules/daily/tags'

import { followTypes, maxFollowKeyLength, readFollowId, type FollowTarget, type FollowType } from './target'

/** One read of the follow buttons asks about at most this many targets (a story page has up to ten). */
export const maxReadTargets = 20

/**
 * A target from a request's type and key (a JSON body), or null: a tag must be one of the daily's
 * industry tags, and a topic key a compared name (`entityKey`), which is how every topic is addressed.
 * Whether a story is about the topic is the data's to check.
 */
export function parseFollowTarget(type: unknown, key: unknown): FollowTarget | null {
  if (typeof type !== 'string' || !(followTypes as readonly string[]).includes(type)) return null
  if (typeof key !== 'string' || key.length === 0 || key.length > maxFollowKeyLength) return null
  if (type === 'tag') return isStoryTag(key) ? { type, key } : null
  return entityKey(key) === key ? { type: type as FollowType, key } : null
}

/** A target from its id (`tag-agents`, `topic-kimi`), held to the same rules. */
export function parseFollowId(value: string | null | undefined): FollowTarget | null {
  const target = readFollowId(value)
  return target && parseFollowTarget(target.type, target.key)
}
