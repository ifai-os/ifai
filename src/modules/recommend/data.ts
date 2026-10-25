import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { inArray } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { cache } from 'react'

import { toneFor } from '@/components/cards/initial-tile'

import { isLocale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { authUsers } from '@/lib/auth/schema'
import { getDb } from '@/lib/db/drizzle'
import { cleanName } from '@/modules/apps/reviews/rules'
import type { Article, ArticleImage as ArticleImageDoc, Media } from '@/payload-types'

import { articlesCacheTag } from './cache'
import { relatedArticles, type ArticleAuthor, type ArticleCard, type ArticleDetail, type ArticleImage } from './list'
import { isArticleChannel, tableOfContents, type RichText } from './rules'

/**
 * Lists filter the published articles here rather than in the database: tags compare in lower
 * case and there are few articles in phase two. Past this many, move the filters to queries.
 */
const listLimit = 2000

function imageOf(media: number | Media | ArticleImageDoc | null | undefined, size?: 'thumb' | 'card'): ArticleImage | null {
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

/** The site owner's cover from the media library, else the one a member uploaded. */
const coverOf = (doc: Article) => (doc.cover && typeof doc.cover === 'object' ? doc.cover : doc.coverImage)

/** Members who wrote articles, by id; a plain object, as the data cache keeps JSON. */
type Authors = Record<string, ArticleAuthor>

/**
 * The names of the members who wrote these articles (rule 16), by member id. Read with the
 * articles, so a new nickname shows when they next change (or within the hour).
 */
async function authorsOf(payload: Payload, docs: Pick<Article, 'author'>[]): Promise<Authors> {
  const ids = [...new Set(docs.flatMap((doc) => (doc.author ? [doc.author] : [])))]
  if (ids.length === 0) return {}
  const rows = await (payload.db as unknown as PostgresAdapter).drizzle
    .select({ id: authUsers.id, name: authUsers.name })
    .from(authUsers)
    .where(inArray(authUsers.id, ids))
  return Object.fromEntries(rows.map((row) => [row.id, { name: cleanName(row.name), tone: toneFor(row.id) }]))
}

function toCard(doc: Article, authors: Authors): ArticleCard | null {
  if (!doc.publishedAt || !isArticleChannel(doc.channel)) return null
  // A member's article whose author is gone is on its way out with them.
  const author = doc.author ? authors[doc.author] : null
  if (author === undefined) return null
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary?.trim() || null,
    lang: isLocale(doc.lang) ? doc.lang : 'en',
    channel: doc.channel,
    tags: (doc.tags ?? []).map((row) => row.tag).filter(Boolean),
    cover: imageOf(coverOf(doc), 'card'),
    minutes: doc.readingMinutes ?? 1,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
    pick: doc.featured && doc.featuredAt && doc.featuredReason ? { at: doc.featuredAt, reason: doc.featuredReason } : null,
    author,
  }
}

const cardSelect = {
  title: true,
  summary: true,
  lang: true,
  channel: true,
  tags: true,
  cover: true,
  coverImage: true,
  author: true,
  readingMinutes: true,
  publishedAt: true,
  updatedAt: true,
  featured: true,
  featuredAt: true,
  featuredReason: true,
} as const

const imageSelect = { url: true, filename: true, width: true, height: true, sizes: true } as const

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
      populate: { media: imageSelect, 'article-images': imageSelect },
    })
    const authors = await authorsOf(payload, docs)
    return (docs as Article[]).map((doc) => toCard(doc, authors)).filter((card): card is ArticleCard => card !== null)
  },
  ['articles-published'],
  { tags: [articlesCacheTag], revalidate: 3600 },
)

/** Every published article, newest first. */
export const publishedArticles = cache(() => loadPublished())

const loadArticle = cached(
  async (id: number): Promise<{ doc: Article; authors: Authors } | null> => {
    const { payload } = await getDb()
    const { docs } = await payload.find({
      collection: 'articles',
      where: { and: [{ id: { equals: id } }, { status: { equals: 'published' } }] },
      depth: 1,
      limit: 1,
      overrideAccess: false,
      populate: { media: { ...imageSelect, alt: true }, 'article-images': imageSelect },
    })
    const doc = docs[0] as Article | undefined
    return doc ? { doc, authors: await authorsOf(payload, [doc]) } : null
  },
  ['article'],
  { tags: [articlesCacheTag], revalidate: 3600 },
)

/** A published article with its body, table of contents and related articles; null when there is none. */
export const getArticle = cache(async (id: number): Promise<ArticleDetail | null> => {
  const loaded = await loadArticle(id)
  if (!loaded) return null
  const { doc, authors } = loaded
  const card = toCard(doc, authors)
  if (!card) return null
  const coverDoc = coverOf(doc)
  const cover = imageOf(coverDoc)
  const alt = coverDoc && typeof coverDoc === 'object' && 'alt' in coverDoc ? (coverDoc.alt ?? '') : ''
  const body = doc.body as RichText
  return {
    ...card,
    coverFull: cover ? { ...cover, alt } : null,
    body,
    toc: tableOfContents(body),
    related: relatedArticles(await publishedArticles(), card),
  }
})
