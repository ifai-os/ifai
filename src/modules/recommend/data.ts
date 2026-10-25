import { cache } from 'react'

import { isLocale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { getDb } from '@/lib/db/drizzle'
import type { Article, Media } from '@/payload-types'

import { articlesCacheTag } from './cache'
import { relatedArticles, type ArticleCard, type ArticleDetail, type ArticleImage } from './list'
import { isArticleChannel, tableOfContents, type RichText } from './rules'

/**
 * Lists filter the published articles here rather than in the database: tags compare in lower
 * case and there are few articles in phase two. Past this many, move the filters to queries.
 */
const listLimit = 2000

function imageOf(media: number | Media | null | undefined, size?: 'thumb' | 'card'): ArticleImage | null {
  if (!media || typeof media !== 'object') return null
  const variant = size ? media.sizes?.[size] : undefined
  const url = variant?.url || media.url
  if (!url) return null
  return {
    url,
    width: (variant?.url ? variant.width : media.width) ?? null,
    height: (variant?.url ? variant.height : media.height) ?? null,
  }
}

function toCard(doc: Article): ArticleCard | null {
  if (!doc.publishedAt || !isArticleChannel(doc.channel)) return null
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary?.trim() || null,
    lang: isLocale(doc.lang) ? doc.lang : 'en',
    channel: doc.channel,
    tags: (doc.tags ?? []).map((row) => row.tag).filter(Boolean),
    cover: imageOf(doc.cover, 'card'),
    minutes: doc.readingMinutes ?? 1,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
    pick: doc.featured && doc.featuredAt && doc.featuredReason ? { at: doc.featuredAt, reason: doc.featuredReason } : null,
  }
}

const cardSelect = {
  title: true,
  summary: true,
  lang: true,
  channel: true,
  tags: true,
  cover: true,
  readingMinutes: true,
  publishedAt: true,
  updatedAt: true,
  featured: true,
  featuredAt: true,
  featuredReason: true,
} as const

// Back-office saves refresh this at once (./cache.ts); the hour only bounds changes made outside Payload's hooks.
const loadPublished = cached(
  async (): Promise<ArticleCard[]> => {
    const { payload } = await getDb()
    const { docs } = await payload.find({
      collection: 'articles',
      where: { status: { equals: 'published' } },
      sort: '-publishedAt',
      depth: 1,
      limit: listLimit,
      pagination: false,
      overrideAccess: false,
      select: cardSelect,
      populate: { media: { url: true, filename: true, width: true, height: true, sizes: true } },
    })
    return (docs as Article[]).map(toCard).filter((card): card is ArticleCard => card !== null)
  },
  ['articles-published'],
  { tags: [articlesCacheTag], revalidate: 3600 },
)

/** Every published article, newest first. */
export const publishedArticles = cache(() => loadPublished())

const loadArticle = cached(
  async (id: number): Promise<Article | null> => {
    const { payload } = await getDb()
    const { docs } = await payload.find({
      collection: 'articles',
      where: { and: [{ id: { equals: id } }, { status: { equals: 'published' } }] },
      depth: 1,
      limit: 1,
      overrideAccess: false,
      populate: { media: { url: true, filename: true, width: true, height: true, sizes: true, alt: true } },
    })
    return (docs[0] as Article | undefined) ?? null
  },
  ['article'],
  { tags: [articlesCacheTag], revalidate: 3600 },
)

/** A published article with its body, table of contents and related articles; null when there is none. */
export const getArticle = cache(async (id: number): Promise<ArticleDetail | null> => {
  const doc = await loadArticle(id)
  const card = doc && toCard(doc)
  if (!doc || !card) return null
  const cover = imageOf(doc.cover)
  const alt = doc.cover && typeof doc.cover === 'object' ? (doc.cover.alt ?? '') : ''
  const body = doc.body as RichText
  return {
    ...card,
    coverFull: cover ? { ...cover, alt } : null,
    body,
    toc: tableOfContents(body),
    related: relatedArticles(await publishedArticles(), card),
  }
})
