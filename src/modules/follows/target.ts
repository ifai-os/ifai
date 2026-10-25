/**
 * What members can follow (docs/specs/daily.md「关注」), and the small rules shared by the
 * follows route, the follow buttons and「我的关注」. No server imports: the buttons use this
 * file too; checking that a target exists is in ./rules.ts and ./data.ts.
 */

/** An industry tag of the daily (`daily/tags.ts`), or a company or product by its topic key (`daily/entities.ts`). */
export const followTypes = ['tag', 'topic'] as const
export type FollowType = (typeof followTypes)[number]

export type FollowTarget = { type: FollowType; key: string }

/** Longest key a target can have: a topic key is a compared name of at most this many characters. */
export const maxFollowKeyLength = 100

/** How a target is written in addresses and answers: `tag-agents`, `topic-kimi`. */
export function followId({ type, key }: FollowTarget): string {
  return `${type}-${key}`
}

/** A target from its id, by shape only (the type, and a key of a sensible length); null for anything else. */
export function readFollowId(value: string | null | undefined): FollowTarget | null {
  const match = value?.match(/^([a-z]+)-(.+)$/)
  if (!match || !(followTypes as readonly string[]).includes(match[1])) return null
  const key = match[2]
  if (key.length > maxFollowKeyLength || key.trim() !== key) return null
  return { type: match[1] as FollowType, key }
}

/**
 * Signing in from a follow button comes back to the same page with ?follow=topic-kimi, and the
 * page then finishes the follow (as saves do with ?save=).
 */
export const pendingFollowParam = 'follow'

/** A member follows at most this many tags, companies and products. */
export const maxFollows = 200
