import { z } from 'zod'

import type { Locale } from '@/i18n/config'
import { getArticle, publishedArticles } from '@/modules/recommend/data'
import { selectArticles, type ArticleCard } from '@/modules/recommend/list'
import { articleMarkdown } from '@/modules/recommend/markdown'
import { articleChannels, articleHref, articleTabs, type ArticleChannel } from '@/modules/recommend/rules'

import { count, facts, lines, oneLine, utc } from '../markdown'
import { defineOperation, notFound } from './types'
import { fileUrl, langParam, pageParam, pageUrl } from './shared'

/**
 * 推荐 (docs/specs/recommend.md) for agents: IFAI's long reads, each written in one language.
 * `lang` only picks the language of the addresses; an article's own `lang` says what it is written in.
 */

export type ArticleItem = {
  id: number
  url: string
  title: string
  summary: string | null
  /** The language the article is written in. */
  lang: Locale
  channel: ArticleChannel
  tags: string[]
  cover: string | null
  minutes: number
  publishedAt: string
  updatedAt: string
  /** Why IFAI picked it, when it is a pick. */
  pick: { at: string; reason: string } | null
}

function articleItem(article: ArticleCard, locale: Locale, origin: string): ArticleItem {
  return {
    id: article.id,
    url: pageUrl(origin, locale, articleHref(article.id)),
    title: article.title,
    summary: article.summary,
    lang: article.lang,
    channel: article.channel,
    tags: article.tags,
    cover: fileUrl(origin, article.cover?.url),
    minutes: article.minutes,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    pick: article.pick,
  }
}

export function articleLine(article: ArticleItem, index: number): string {
  return lines(
    `${index + 1}. **${oneLine(article.title)}**`,
    `   ${facts(article.channel, `in ${article.lang}`, `${article.minutes} min`, utc(article.publishedAt), article.pick ? `picked: ${oneLine(article.pick.reason)}` : null)}`,
    article.summary ? `   ${oneLine(article.summary)}` : null,
    `   id ${article.id} · ${article.url}`,
  )
}

// ── list_articles ──────────────────────────────────────

export type ArticleListView = { tab: 'picks' | 'latest'; articles: ArticleItem[]; total: number; page: number; pages: number }

export const listArticles = defineOperation({
  name: 'articles.list',
  tool: 'list_articles',
  title: 'Long reads',
  description:
    'IFAI’s long reads on models, agents, coding, prompts, images, design and careers, 20 a page. `tab`: picks (chosen by IFAI, latest pick first) or latest (every article, newest first). ' +
    'Narrow with `channel` or `tag`. Each article is written in one language, given as `lang`. Read one with read_article.',
  module: 'recommend',
  path: '/articles',
  input: z.object({
    lang: langParam,
    tab: z.enum(articleTabs).default('picks').describe('picks or latest.'),
    channel: z.enum(articleChannels).optional().describe('models, agents, coding, prompts, images, design or career.'),
    tag: z.string().trim().min(1).max(20).optional().describe('One tag, any case.'),
    page: pageParam,
  }),
  async run({ lang, tab, channel, tag, page }, { origin }): Promise<ArticleListView> {
    const list = selectArticles(await publishedArticles(), { tab, channel: channel ?? null, tag: tag ?? null, page })
    return { tab: list.tab, articles: list.articles.map((article) => articleItem(article, lang, origin)), total: list.total, page, pages: list.pages }
  },
  markdown({ tab, articles, total, page, pages }) {
    if (!articles.length) return page > 1 ? `No articles on page ${page}.` : 'No articles match.'
    return lines(
      `${tab === 'picks' ? count(total, 'picked article') : count(total, 'article')} · page ${page} of ${pages}`,
      '',
      articles.map(articleLine).join('\n'),
      page < pages ? `\nMore: call again with page=${page + 1}.` : null,
    )
  },
})

// ── read_article ───────────────────────────────────────

export type ArticleDetailView = ArticleItem & {
  /** The body as Markdown, with full addresses for links and pictures. */
  body: string
  toc: string[]
  related: ArticleItem[]
}

export const readArticle = defineOperation({
  name: 'articles.read',
  tool: 'read_article',
  title: 'Read an article',
  description: 'One long read in full, as Markdown, with its channel, tags, reading time, why IFAI picked it, and related articles.',
  module: 'recommend',
  path: '/articles/{id}',
  input: z.object({
    id: z.number().int().min(1).max(2_147_483_647).describe('The article’s id, from list_articles or search.'),
    lang: langParam,
  }),
  async run({ id, lang }, { origin }): Promise<ArticleDetailView> {
    const article = await getArticle(id)
    if (!article) throw notFound(`No published article has the id ${id}.`)
    return {
      ...articleItem(article, lang, origin),
      cover: fileUrl(origin, article.coverFull?.url ?? article.cover?.url),
      body: articleMarkdown(article.body, origin),
      toc: article.toc.map((entry) => entry.text),
      related: article.related.map((other) => articleItem(other, lang, origin)),
    }
  },
  markdown(article) {
    return lines(
      `# ${article.title}`,
      article.summary,
      facts(article.channel, `written in ${article.lang}`, `${article.minutes} min read`, `published ${utc(article.publishedAt)}`, article.tags.length ? `tags ${article.tags.join(', ')}` : null),
      article.pick ? `IFAI pick: ${article.pick.reason}` : null,
      `IFAI page: ${article.url}`,
      article.body ? `\n${article.body}` : null,
      article.related.length ? ['\n## Related', ...article.related.map((other) => `- ${oneLine(other.title)} · id ${other.id}`)].join('\n') : null,
    )
  },
})

export const articleOperations = [listArticles, readArticle]
