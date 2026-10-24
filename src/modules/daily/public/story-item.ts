import type { Locale } from '@/i18n/config'
import { inAnyLanguage, inReaderLanguage, type InLanguage, type Localized } from '@/lib/i18n/localized'
import type { Media, Story } from '@/payload-types'

import { storyCategories, type StoryCategory } from '../categories'
import type { EntityKind, StoryEntity } from '../entities'
import { parseVideo, type Video } from '../media'
import type { HeatTrend, SourceRole } from '../story-fields'
import type { StoryTag } from '../tags'

/** What the pages show of a story, in the reader's language (no Payload code: components and tests import this). */

export type StorySource = { name: string; role: SourceRole; url: string; publishedAt: string | null }

/** A picture as the pages draw it: our own file and its size. */
export type StoryPicture = { url: string; width: number; height: number }

/** The story's picture or video (docs/specs/daily.md「配图与视频」). A video's cover may be missing. */
export type StoryMedia =
  | { kind: 'image'; picture: StoryPicture; credit: string | null }
  | { kind: 'video'; video: Video; picture: StoryPicture | null; credit: string | null }

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
  media: StoryMedia | null
}

/** A story in「48 小时热门」and「今日最热」: its event's heat and how many outlets reported it. */
export type HotStory = StoryItem & {
  eventId: number
  /** 0–100, the event's heat (src/modules/daily/heat/rules.ts). */
  heat: number
  trend: HeatTrend | null
  /** Outlets that reported it, the original publisher included; discussion threads do not count. */
  outlets: number
}

/** A company or product the story is about; `key` names its topic page; `app` when the apps module matched it to a published app. */
export type StoryEntityItem = { name: string; kind: EntityKind; key: string; app: { slug: string; name: string } | null }

/** 「话题追踪」: published stories about the same product or company, newest first, this one included. */
export type StoryTopic = { name: string; key: string; stories: StoryItem[] }

/** An app's logo as the pages draw it. */
export type TopicLogo = { url: string; width: number | null; height: number | null }

/**
 * A company's or product's topic page (docs/specs/daily.md「公司与产品的话题页」): its name and
 * kind as the newest story writes them, the published stories about it, newest first, one page
 * at a time; the app it is, and for a product the app's developer, when the apps module has it.
 */
export type TopicPage = {
  key: string
  name: string
  kind: EntityKind
  total: number
  page: number
  pages: number
  stories: StoryItem[]
  /** Stories older than this page's. */
  earlier: number
  app: { slug: string; name: string; logo: TopicLogo | null } | null
  /** `key` when the developer has a topic page too. */
  developer: { name: string; key: string | null } | null
}

export type StoryDetail = StoryItem & {
  sources: StorySource[]
  /** Other published stories of the same event, newest first. */
  developments: StoryItem[]
  tags: StoryTag[]
  entities: StoryEntityItem[]
  /** Null unless another story shares the topic. */
  topic: StoryTopic | null
  /** 「同类事件」: the most similar published stories of other events, most similar first. */
  similar: StoryItem[]
}

/** The stored companies and products, keys filled in for rows an older save left without one. */
export function entitiesOf(doc: Pick<Story, 'entities'>, key: (name: string) => string): StoryEntity[] {
  return (doc.entities ?? []).flatMap(({ name, kind, key: stored }) => {
    const trimmed = name?.trim()
    if (!trimmed) return []
    return [{ name: trimmed, kind, key: stored || key(trimmed) }]
  })
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
    media: mediaOf(doc.media),
  }
}

function pictureOf(image: number | Media | null | undefined): StoryPicture | null {
  if (!image || typeof image !== 'object' || !image.url || !image.width || !image.height) return null
  return { url: image.url, width: image.width, height: image.height }
}

/** Null unless there is something to show: a picture, or a video address we can play. */
export function mediaOf(media: Story['media']): StoryMedia | null {
  if (!media) return null
  const picture = pictureOf(media.image)
  const credit = media.credit?.trim() || null
  if (media.kind === 'video') {
    const video = parseVideo(media.videoUrl)
    return video ? { kind: 'video', video, picture, credit } : null
  }
  if (media.kind === 'image' && picture) return { kind: 'image', picture, credit }
  return null
}

export function toHot(doc: RawStory, locale: Locale): HotStory {
  return {
    ...toItem(doc, locale),
    eventId: doc.eventId,
    heat: doc.heat ?? 0,
    trend: doc.heatTrend ?? null,
    outlets: Math.max(1, sourcesOf(doc).filter((source) => source.role !== 'discussion').length),
  }
}

/** The hottest story of each event, hottest first: stories come sorted by heat, then newest first. */
export function onePerEvent<T extends { eventId: number }>(stories: readonly T[], limit: number): T[] {
  const seen = new Set<number>()
  const result: T[] = []
  for (const story of stories) {
    if (seen.has(story.eventId)) continue
    seen.add(story.eventId)
    result.push(story)
    if (result.length === limit) break
  }
  return result
}
