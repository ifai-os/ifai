import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Locale } from '@/i18n/config'
import { detectLanguage } from '@/lib/i18n/detect'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import type { Article, ArticleImage } from '@/payload-types'

import { attachImages, ownImages, uploadedImage, type UploadedImage } from './images'
import { partsToBody } from './markdown'
import { tableOfContents, type ArticleChannel, type ArticleStatus, type RichNode, type RichText, type TocEntry } from './rules'
import { articleReports } from './schema'
import { imageFiles, splitMarkdown, writeRules, type ArticleInput, type ReportReason, type WriteError } from './writing'

/**
 * Members writing their own articles (docs/specs/recommend.md rules 12–17), for the routes in
 * src/app/api/recommend and the writing pages. Works on the Payload instance it is given; every
 * read and write here checks the article is the member's own.
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** Articles the member started this Shanghai day, drafts and deleted ones aside: at most `dailyArticles`. */
export async function articlesToday(payload: Payload, userId: string, now = new Date()): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'articles',
    where: { author: { equals: userId }, createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
    overrideAccess: true,
  })
  return totalDocs
}

async function ownArticle(payload: Payload, userId: string, id: number): Promise<Article | null> {
  const { docs } = await payload.find({
    collection: 'articles',
    where: { id: { equals: id }, author: { equals: userId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

type Built = { ok: true; body: RichText; imageIds: number[]; images: ArticleImage[] } | { ok: false; error: WriteError }

/** The body for the Markdown, with the member's own pictures only (rule 14). */
async function build(payload: Payload, userId: string, markdown: string, articleId?: number | null): Promise<Built> {
  const split = splitMarkdown(markdown)
  if (!split.ok) return split
  const files = imageFiles(split.parts)
  const images = await ownImages(payload, userId, { files, ids: [], articleId })
  const byFile = new Map(images.flatMap((image) => (image.filename ? [[image.filename, image.id] as const] : [])))
  if (files.some((file) => !byFile.has(file))) return { ok: false, error: 'image-source' }
  return { ok: true, body: await partsToBody(split.parts, byFile), imageIds: images.map((image) => image.id), images }
}

export type SaveResult = { ok: true; id: number; status: ArticleStatus } | { ok: false; error: WriteError }

/**
 * Saves a new article (`id` null) or one of the member's own: a draft, or published (rule 15).
 * A hidden article stays as the site owner left it. Its language is told from its words.
 */
export async function saveArticle(
  payload: Payload,
  userId: string,
  input: ArticleInput,
  { id, locale }: { id: number | null; locale: Locale },
): Promise<SaveResult> {
  if (id !== null) {
    const existing = await ownArticle(payload, userId, id)
    if (!existing) return { ok: false, error: 'not-found' }
    if (existing.status === 'hidden') return { ok: false, error: 'hidden' }
  } else if ((await articlesToday(payload, userId)) >= writeRules.dailyArticles) {
    return { ok: false, error: 'daily-limit' }
  }

  const built = await build(payload, userId, input.markdown, id)
  if (!built.ok) return built
  if (input.cover !== null && (await ownImages(payload, userId, { files: [], ids: [input.cover], articleId: id })).length === 0) {
    return { ok: false, error: 'invalid-request' }
  }

  const detected = detectLanguage(`${input.title}\n${input.summary}\n${input.markdown}`, locale)
  const status: ArticleStatus = input.publish ? 'published' : 'draft'
  const data = {
    title: input.title,
    summary: input.summary || null,
    channel: input.channel,
    tags: input.tags.map((tag) => ({ tag })),
    markdown: input.markdown,
    body: built.body as Article['body'],
    lang: detected === 'und' ? locale : detected,
    status,
    coverImage: input.cover,
  }
  const saved =
    id === null
      ? await payload.create({ collection: 'articles', data: { ...data, author: userId }, overrideAccess: true })
      : await payload.update({ collection: 'articles', id, data, overrideAccess: true })
  await attachImages(payload, saved.id, [...new Set([...built.imageIds, ...(input.cover ? [input.cover] : [])])], status === 'published')
  return { ok: true, id: saved.id, status }
}

/** Deletes one of the member's own articles; its pictures and reports go with it (the collection's hooks). */
export async function deleteOwnArticle(payload: Payload, userId: string, id: number): Promise<boolean> {
  if (!(await ownArticle(payload, userId, id))) return false
  await payload.delete({ collection: 'articles', id, overrideAccess: true })
  return true
}

export type MyArticle = {
  id: number
  title: string
  status: ArticleStatus
  channel: ArticleChannel
  lang: string
  updatedAt: string
  publishedAt: string | null
}

/** 「我的文章」: every article of the member's, hidden ones too, last changed first. */
export async function myArticles(payload: Payload, userId: string): Promise<MyArticle[]> {
  const { docs } = await payload.find({
    collection: 'articles',
    where: { author: { equals: userId } },
    sort: '-updatedAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { title: true, status: true, channel: true, lang: true, updatedAt: true, publishedAt: true },
  })
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    status: doc.status,
    channel: doc.channel,
    lang: doc.lang,
    updatedAt: doc.updatedAt,
    publishedAt: doc.publishedAt ?? null,
  }))
}

export type ArticleDraft = {
  id: number
  title: string
  summary: string
  channel: ArticleChannel
  tags: string[]
  markdown: string
  cover: UploadedImage | null
  status: ArticleStatus
}

/** One of the member's own articles as the writing page opens it: the Markdown they wrote. */
export async function articleForEditing(payload: Payload, userId: string, id: number): Promise<ArticleDraft | null> {
  const { docs } = await payload.find({
    collection: 'articles',
    where: { id: { equals: id }, author: { equals: userId } },
    depth: 1,
    limit: 1,
    overrideAccess: true,
    select: { title: true, summary: true, channel: true, tags: true, markdown: true, coverImage: true, status: true },
    populate: { 'article-images': { url: true, filename: true, width: true, height: true, sizes: true } },
  })
  const doc = docs[0]
  if (!doc) return null
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary ?? '',
    channel: doc.channel,
    tags: (doc.tags ?? []).map((row) => row.tag),
    markdown: doc.markdown ?? '',
    cover: doc.coverImage && typeof doc.coverImage === 'object' ? uploadedImage(doc.coverImage) : null,
    status: doc.status,
  }
}

export type Preview = { ok: true; body: RichText; toc: TocEntry[] } | { ok: false; error: WriteError }

/** The body for the writing page's「预览」, with its pictures filled in as the article page reads them. */
export async function previewBody(payload: Payload, userId: string, markdown: string): Promise<Preview> {
  const built = await build(payload, userId, markdown)
  if (!built.ok) return built
  const byId = new Map(built.images.map((image) => [image.id, image]))
  const fill = (nodes: RichNode[]): RichNode[] =>
    nodes.map((node) => {
      if (node.type === 'upload' && typeof node.value === 'number') {
        const image = byId.get(node.value)
        return image ? { ...node, value: { id: image.id, url: image.url, width: image.width, height: image.height, sizes: image.sizes } } : node
      }
      return node.children ? { ...node, children: fill(node.children) } : node
    })
  const root = built.body?.root
  const body: RichText = root ? { root: { ...root, children: fill(root.children ?? []) } } : built.body
  return { ok: true, body, toc: tableOfContents(body) }
}

export type ReportResult = 'reported' | 'not-found' | 'own-article'

/**
 * A reader's report on a published member's article (rule 17), once per reporter: reporting
 * again is no error. The site owner's own articles cannot be reported.
 */
export async function reportArticle(
  payload: Payload,
  { articleId, reason, reporter, userId }: { articleId: number; reason: ReportReason; reporter: string; userId: string | null },
): Promise<ReportResult> {
  const { docs } = await payload.find({
    collection: 'articles',
    where: { id: { equals: articleId }, status: { equals: 'published' }, author: { exists: true } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    select: { author: true },
  })
  const article = docs[0]
  if (!article) return 'not-found'
  if (userId && article.author === userId) return 'own-article'
  await drizzleOf(payload).insert(articleReports).values({ articleId, reporter, reason }).onConflictDoNothing()
  return 'reported'
}
