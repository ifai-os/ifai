import type { Locale } from '@/i18n/config'
import type { EntityKind } from '@/modules/daily/entities'
import { followedStories, topicNames, type StoryPage } from '@/modules/daily/public/data'
import { isStoryTag, type StoryTag } from '@/modules/daily/tags'

import { memberFollows } from './data'

/** 「我的关注」: what the member follows, newest first, and one page of its news. */
export type FollowingPage = {
  tags: StoryTag[]
  /** `name` is the key itself, and `kind` null, once no published story is about it any more. */
  topics: { key: string; name: string; kind: EntityKind | null }[]
  stories: StoryPage
}

export async function getFollowingPage(userId: string, page: number, locale: Locale): Promise<FollowingPage> {
  const rows = await memberFollows(userId)
  const tags = rows.flatMap((row) => (row.type === 'tag' && isStoryTag(row.key) ? [row.key] : []))
  const keys = rows.flatMap((row) => (row.type === 'topic' ? [row.key] : []))
  const [names, stories] = await Promise.all([topicNames(keys), followedStories({ locale, tags, keys, page })])
  return {
    tags,
    topics: keys.map((key) => ({ key, name: names.get(key)?.name ?? key, kind: names.get(key)?.kind ?? null })),
    stories,
  }
}
