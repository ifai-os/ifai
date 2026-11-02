import { z } from 'zod'

import type { Locale } from '@/i18n/config'
import { storyCategories, type StoryCategory } from '@/modules/daily/categories'
import type { EntityKind } from '@/modules/daily/entities'
import type { Video } from '@/modules/daily/media'
import { getStory, getTopicPage, hotStories, storyFeed, type StoryItem } from '@/modules/daily/public/data'
import { storyHref, topicHref } from '@/modules/daily/public/list-params'
import type { HeatTrend, SourceRole } from '@/modules/daily/story-fields'
import { storyTags, type StoryTag } from '@/modules/daily/tags'

import { count, facts, lines, oneLine, utc } from '../markdown'
import { defineOperation, invalid, notFound } from './types'
import { fileUrl, langParam, pageParam, pageUrl, textOf } from './shared'

/** The daily news (docs/specs/daily.md) for agents: lists, the 48-hour board, one story, a topic. */

export type NewsItem = {
  id: number
  slug: string
  url: string
  title: string
  summary: string | null
  /** The language `title` and `summary` are in: the one asked for, or English when it has none. */
  lang: Locale
  category: StoryCategory
  publishedAt: string
  correctedAt: string | null
  /** 传播指数, 0–100: how far the story's event spread at its peak. */
  spread: number
  /** Other outlets that reported the same event. */
  reports: number
  /** Who announced it (or reported it first). */
  source: string | null
  image: string | null
  video: string | null
}

function videoUrl(video: Video): string {
  if (video.provider === 'youtube') return `https://www.youtube.com/watch?v=${video.id}`
  if (video.provider === 'vimeo') return `https://vimeo.com/${video.id}`
  return video.url
}

export function newsItem(story: StoryItem, locale: Locale, origin: string): NewsItem {
  const media = story.media
  return {
    id: story.id,
    slug: story.slug,
    url: pageUrl(origin, locale, storyHref(story.slug)),
    title: story.title.value,
    summary: textOf(story.summary),
    lang: story.title.lang,
    category: story.category,
    publishedAt: story.publishedAt,
    correctedAt: story.correctedAt,
    spread: story.spread,
    reports: story.moreReports,
    source: story.originalName,
    image: fileUrl(origin, media?.picture?.url),
    video: media?.kind === 'video' ? videoUrl(media.video) : null,
  }
}

/** A news item as one numbered list entry. */
export function newsLine(item: NewsItem, index: number): string {
  return lines(
    `${index + 1}. **${oneLine(item.title)}**`,
    `   ${facts(item.source, utc(item.publishedAt), item.category, item.spread ? `spread ${item.spread}/100` : null)}`,
    item.summary ? `   ${oneLine(item.summary)}` : null,
    `   slug \`${item.slug}\` · ${item.url}`,
  )
}

// ── list_news ──────────────────────────────────────────

const cursorPattern = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([1-9]\d{0,9})$/

/** Where the next page starts: the last story's publishing time and id. */
export function writeCursor(item: Pick<NewsItem, 'publishedAt' | 'id'>): string {
  return `${new Date(item.publishedAt).toISOString()}_${item.id}`
}

export function readCursor(value: string): { publishedAt: string; id: number } | null {
  const match = cursorPattern.exec(value)
  if (!match || Number.isNaN(Date.parse(match[1]))) return null
  return { publishedAt: new Date(match[1]).toISOString(), id: Number(match[2]) }
}

export type NewsList = { stories: NewsItem[]; next: string | null; lang: Locale }

export const listNews = defineOperation({
  name: 'news.list',
  tool: 'list_news',
  title: 'Latest AI news',
  description:
    'Published stories from the IFAI daily AI news, newest first: title, summary, source, time, category and spread index (0–100, how far the story travelled). ' +
    'Filter by `category` or `tag`; pass `since` (an ISO time) to get only what is new since you last looked; pass `before` (the `next` of the previous page) to go further back. ' +
    'Read one story in full with read_news.',
  module: 'daily',
  path: '/news',
  input: z.object({
    lang: langParam,
    category: z
      .enum(storyCategories)
      .optional()
      .describe('llm (closed models), tools (AI apps and tools), aigc (images, video, audio), open (open-weight models and open source), industry, research or robotics.'),
    tag: z.enum(storyTags).optional().describe('An industry tag, such as agents or vibe-coding.'),
    since: z
      .union([z.iso.datetime({ offset: true }), z.iso.date()])
      .optional()
      .describe('Only stories published after this time: ISO 8601, e.g. 2026-11-01T08:00:00Z or 2026-11-01 (midnight UTC).'),
    before: z.string().max(64).optional().describe('`next` from the previous page.'),
    limit: z.number().int().min(1).max(50).default(20).describe('Stories per page, 1–50.'),
  }),
  async run({ lang, category, tag, since, before, limit }, { origin }): Promise<NewsList> {
    const cursor = before ? readCursor(before) : null
    if (before && !cursor) throw invalid('`before` is not a `next` value from this list.')
    const stories = await storyFeed({
      locale: lang,
      category: category ?? null,
      tag: (tag as StoryTag | undefined) ?? null,
      since: since ? new Date(since) : null,
      before: cursor,
      limit: limit + 1,
    })
    const page = stories.slice(0, limit).map((story) => newsItem(story, lang, origin))
    return { stories: page, next: stories.length > limit && page.length ? writeCursor(page[page.length - 1]) : null, lang }
  },
  markdown({ stories, next }, { since }) {
    if (!stories.length) return since ? `No new stories since ${utc(since) ?? since}.` : 'No stories.'
    return lines(
      `${count(stories.length, 'story', 'stories')}, newest first.`,
      '',
      stories.map(newsLine).join('\n'),
      next ? `\nMore: call again with before="${next}".` : null,
    )
  },
})

// ── trending_news ──────────────────────────────────────

export type TrendingItem = NewsItem & { heat: number; trend: HeatTrend | null }

export const trendingNews = defineOperation({
  name: 'news.trending',
  tool: 'trending_news',
  title: 'Trending AI news (48 hours)',
  description:
    'The stories whose events are spreading most in the last 48 hours, hottest first, with heat (0–100) and whether it is rising. ' +
    'Use it for "what is everyone talking about in AI today".',
  module: 'daily',
  path: '/news/trending',
  input: z.object({ lang: langParam }),
  async run({ lang }, { origin }): Promise<{ stories: TrendingItem[]; lang: Locale }> {
    const stories = await hotStories(lang)
    return { stories: stories.map((story) => ({ ...newsItem(story, lang, origin), heat: story.heat, trend: story.trend })), lang }
  },
  markdown({ stories }) {
    if (!stories.length) return 'Nothing is trending right now.'
    return lines(
      'Trending in the last 48 hours, hottest first:',
      '',
      stories
        .map((story, index) =>
          lines(
            `${index + 1}. **${oneLine(story.title)}** · heat ${story.heat}/100${story.trend ? ` (${story.trend})` : ''}`,
            `   ${facts(story.source, utc(story.publishedAt), story.category)}`,
            story.summary ? `   ${oneLine(story.summary)}` : null,
            `   slug \`${story.slug}\` · ${story.url}`,
          ),
        )
        .join('\n'),
    )
  },
})

// ── read_news ──────────────────────────────────────────

export type NewsDetail = NewsItem & {
  /** The full story as Markdown (paragraphs and `##` subheadings); null while it has none. */
  body: string | null
  bodyLang: Locale | null
  sources: { name: string; role: SourceRole; url: string; publishedAt: string | null }[]
  tags: StoryTag[]
  /** Companies and products the story is about; `topic` is the key for news_topic. */
  entities: { name: string; kind: EntityKind; topic: string; app: { slug: string; name: string; url: string } | null }[]
  /** Other stories about the same event, newest first. */
  developments: NewsItem[]
  /** Other stories about the same company or product. */
  topic: { name: string; key: string; stories: NewsItem[] } | null
  similar: NewsItem[]
}

const slugParam = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,199}$/, 'A slug is lowercase letters, digits and hyphens.')
  .describe('The story’s slug, from a list or search.')

export const readNews = defineOperation({
  name: 'news.read',
  tool: 'read_news',
  title: 'Read a news story',
  description:
    'One published story in full: body, every source with its link, industry tags, the companies and products it is about (each with a topic key for news_topic, and the IFAI app when there is one), other stories about the same event and similar events.',
  module: 'daily',
  path: '/news/{slug}',
  input: z.object({ slug: slugParam, lang: langParam }),
  async run({ slug, lang }, { origin }): Promise<NewsDetail> {
    const story = await getStory(slug, lang)
    if (!story) throw notFound(`No published story has the slug "${slug}".`)
    const item = (other: StoryItem) => newsItem(other, lang, origin)
    return {
      ...item(story),
      body: story.body ? story.body.value.map((block) => (block.kind === 'heading' ? `## ${block.text}` : block.text)).join('\n\n') : null,
      bodyLang: story.body?.lang ?? null,
      sources: story.sources.map(({ name, role, url, publishedAt }) => ({ name, role, url, publishedAt })),
      tags: story.tags,
      entities: story.entities.map((entity) => ({
        name: entity.name,
        kind: entity.kind,
        topic: entity.key,
        app: entity.app ? { ...entity.app, url: pageUrl(origin, lang, `/apps/${entity.app.slug}`) } : null,
      })),
      developments: story.developments.map(item),
      topic: story.topic ? { name: story.topic.name, key: story.topic.key, stories: story.topic.stories.map(item) } : null,
      similar: story.similar.map(item),
    }
  },
  markdown(story) {
    const others = (title: string, items: NewsItem[]) =>
      items.length ? [`\n## ${title}`, ...items.map((item) => `- ${oneLine(item.title)} (${utc(item.publishedAt)}) · slug \`${item.slug}\``)].join('\n') : null
    return lines(
      `# ${oneLine(story.title)}`,
      facts(
        `Published ${utc(story.publishedAt)}`,
        story.correctedAt ? `corrected ${utc(story.correctedAt)}` : null,
        story.category,
        `spread ${story.spread}/100`,
        story.reports ? `${story.reports} other reports` : null,
      ),
      story.url,
      story.summary ? `\n${story.summary}` : null,
      story.body ? `\n${story.body}` : null,
      story.video ? `\nVideo: ${story.video}` : null,
      story.sources.length
        ? ['\n## Sources', ...story.sources.map((source) => `- ${source.name} (${facts(source.role, utc(source.publishedAt))}): ${source.url}`)].join('\n')
        : null,
      story.tags.length ? `\nTags: ${story.tags.join(', ')}` : null,
      story.entities.length
        ? [
            '\n## Companies and products',
            ...story.entities.map((entity) =>
              `- ${entity.name} (${entity.kind}) · topic \`${entity.topic}\`${entity.app ? ` · IFAI app \`${entity.app.slug}\` ${entity.app.url}` : ''}`,
            ),
          ].join('\n')
        : null,
      others('Same event', story.developments),
      story.topic ? others(`More about ${story.topic.name} (topic \`${story.topic.key}\`)`, story.topic.stories.filter((item) => item.id !== story.id)) : null,
      others('Similar events', story.similar),
    )
  },
})

// ── news_topic ─────────────────────────────────────────

export type NewsTopic = {
  key: string
  name: string
  kind: EntityKind
  url: string
  total: number
  page: number
  pages: number
  stories: NewsItem[]
  app: { slug: string; name: string; url: string } | null
  developer: { name: string; topic: string | null } | null
}

export const newsTopic = defineOperation({
  name: 'news.topic',
  tool: 'news_topic',
  title: 'News about a company or product',
  description:
    'Every published story about one company or product, newest first, 20 a page, and the IFAI app it is when there is one. ' +
    'The key comes from read_news (`entities[].topic`).',
  module: 'daily',
  path: '/news/topic/{key}',
  input: z.object({
    key: z.string().min(1).max(100).describe('The topic key, e.g. "openai".'),
    lang: langParam,
    page: pageParam,
  }),
  async run({ key, lang, page }, { origin }): Promise<NewsTopic> {
    const topic = await getTopicPage(key, page, lang)
    if (!topic) throw notFound(page > 1 ? `The topic "${key}" has no page ${page}.` : `No published story is about "${key}".`)
    return {
      key: topic.key,
      name: topic.name,
      kind: topic.kind,
      url: pageUrl(origin, lang, topicHref(topic.key, page)),
      total: topic.total,
      page: topic.page,
      pages: topic.pages,
      stories: topic.stories.map((story) => newsItem(story, lang, origin)),
      app: topic.app ? { slug: topic.app.slug, name: topic.app.name, url: pageUrl(origin, lang, `/apps/${topic.app.slug}`) } : null,
      developer: topic.developer ? { name: topic.developer.name, topic: topic.developer.key } : null,
    }
  },
  markdown(topic) {
    return lines(
      `# ${topic.name} (${topic.kind})`,
      topic.url,
      topic.app ? `IFAI app: ${topic.app.name} · slug \`${topic.app.slug}\` · ${topic.app.url}` : null,
      topic.developer ? `Made by ${topic.developer.name}${topic.developer.topic ? ` (topic \`${topic.developer.topic}\`)` : ''}` : null,
      `${count(topic.total, 'story', 'stories')} · page ${topic.page} of ${topic.pages}`,
      '',
      topic.stories.map(newsLine).join('\n'),
      topic.page < topic.pages ? `\nMore: call again with page=${topic.page + 1}.` : null,
    )
  },
})

export const newsOperations = [listNews, trendingNews, readNews, newsTopic]
