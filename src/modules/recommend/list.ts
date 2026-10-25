import type { Locale } from '@/i18n/config'

import { pageSize, tagKey, type ArticleChannel, type ListQuery, type RichText, type TocEntry } from './rules'

export type ArticleImage = { url: string; width: number | null; height: number | null }

/** An article as lists show it: everything but the body. */
export type ArticleCard = {
  id: number
  title: string
  summary: string | null
  /** The language it is written in: the `lang` of its title, summary, body and pick reason. */
  lang: Locale
  channel: ArticleChannel
  tags: string[]
  cover: ArticleImage | null
  minutes: number
  publishedAt: string
  updatedAt: string
  /** When it was picked (规则 2), with the reason; null when it is not. */
  pick: { at: string; reason: string } | null
  /** The member who wrote it (rule 16): a name (empty when they have none) and a tile tone, never an id; null for the site owner's. */
  author: ArticleAuthor | null
}

export type ArticleAuthor = { name: string; tone: number }

export type ArticleDetail = ArticleCard & {
  coverFull: (ArticleImage & { alt: string }) | null
  body: RichText
  toc: TocEntry[]
  related: ArticleCard[]
}

export type ArticleList = { articles: ArticleCard[]; total: number; pages: number }

/** Headline picks at the top of the list (规则 10). */
export const headlineCount = 3
/** Related articles beside an article. */
const relatedCount = 3
/** 「热门标签」: the most used tags in articles of the last 90 days. */
const hotTagCount = 10
const hotTagDays = 90

function byPickTime(a: ArticleCard, b: ArticleCard): number {
  return (b.pick?.at ?? '').localeCompare(a.pick?.at ?? '')
}

/** The picked articles, latest pick first. */
export function picksOf(articles: readonly ArticleCard[]): ArticleCard[] {
  return articles.filter((article) => article.pick).sort(byPickTime)
}

/**
 * One page of the list (规则 10): 推荐 is the picks by pick time, 最新 every published article;
 * either in one channel or with one tag. 推荐 with no picks at all shows 最新 instead, so the
 * page is never empty while there are articles.
 */
export function selectArticles(articles: readonly ArticleCard[], query: ListQuery): ArticleList & { tab: ListQuery['tab'] } {
  const key = query.tag ? tagKey(query.tag) : null
  const matching = articles.filter(
    (article) => (!query.channel || article.channel === query.channel) && (!key || article.tags.some((tag) => tagKey(tag) === key)),
  )
  const picks = picksOf(matching)
  const tab = query.tab === 'picks' && picks.length === 0 && !articles.some((article) => article.pick) ? 'latest' : query.tab
  const chosen = tab === 'picks' ? picks : matching
  const start = (query.page - 1) * pageSize
  return {
    tab,
    articles: chosen.slice(start, start + pageSize),
    total: chosen.length,
    pages: Math.max(1, Math.ceil(chosen.length / pageSize)),
  }
}

/** The most used tags of recent articles, most used first, each in its most common spelling. */
export function hotTags(articles: readonly ArticleCard[], now = new Date()): { tag: string; count: number }[] {
  const since = new Date(now.getTime() - hotTagDays * 86_400_000).toISOString()
  const counts = new Map<string, { spellings: Map<string, number>; count: number }>()
  for (const article of articles) {
    if (article.publishedAt < since) continue
    for (const tag of article.tags) {
      const entry = counts.get(tagKey(tag)) ?? { spellings: new Map(), count: 0 }
      entry.count += 1
      entry.spellings.set(tag, (entry.spellings.get(tag) ?? 0) + 1)
      counts.set(tagKey(tag), entry)
    }
  }
  return [...counts.values()]
    .map(({ spellings, count }) => ({ tag: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, hotTagCount)
}

/** Same channel first, newest first, then the newest others; never the article itself. */
export function relatedArticles(articles: readonly ArticleCard[], article: Pick<ArticleCard, 'id' | 'channel'>): ArticleCard[] {
  const others = articles.filter((other) => other.id !== article.id)
  const sameChannel = others.filter((other) => other.channel === article.channel)
  const rest = others.filter((other) => other.channel !== article.channel)
  return [...sameChannel, ...rest].slice(0, relatedCount)
}
