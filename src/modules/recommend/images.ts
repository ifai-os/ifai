import { randomBytes } from 'node:crypto'

import type { Payload, PayloadRequest, Where } from 'payload'
import sharp from 'sharp'

import { shanghaiDayStart } from '@/lib/shanghai-day'
import type { ArticleImage } from '@/payload-types'

import { imageTypes, writeRules } from './writing'

/**
 * Readers' pictures, kept in the `article-images` upload collection
 * (./collections/ArticleImages.ts; docs/specs/recommend.md rule 14). Works on the Payload
 * instance it is given.
 */

const collection = 'article-images'

type ImageType = (typeof imageTypes)[number]

const formats: Record<string, ImageType> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
const extensions: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Animations are opened frame by frame; this many pixels over all frames at most. */
const maxAnimatedPixels = 200_000_000

/**
 * What the bytes are, read from the bytes themselves (never from the name or the type the
 * browser gave): a JPEG, PNG, WebP or GIF of at most `maxPixels`, or null.
 */
export async function inspectImage(bytes: Uint8Array): Promise<{ mimeType: ImageType; width: number; height: number } | null> {
  if (bytes.byteLength === 0) return null
  try {
    const { format, width, height, pages } = await sharp(bytes, { limitInputPixels: writeRules.maxPixels }).metadata()
    const mimeType = format ? formats[format] : undefined
    if (!mimeType || !width || !height) return null
    if (width * height > writeRules.maxPixels || width * height * (pages ?? 1) > maxAnimatedPixels) return null
    return { mimeType, width, height }
  } catch {
    return null
  }
}

export type UploadedImage = { id: number; url: string; width: number; height: number }

/** A picture as the writing page and the preview use it: its address and size. */
export function uploadedImage(doc: Pick<ArticleImage, 'id' | 'url' | 'width' | 'height' | 'sizes'>): UploadedImage | null {
  if (!doc.url) return null
  return { id: doc.id, url: doc.url, width: doc.width ?? 0, height: doc.height ?? 0 }
}

/**
 * Stores a picture under a random name: the reader's own file name never shows. Payload turns
 * it upright, drops its metadata and makes the WebP copies. Nobody else can open it until its
 * article is published.
 */
export async function saveImage(payload: Payload, image: { bytes: Uint8Array; mimeType: ImageType }, uploader: string): Promise<UploadedImage> {
  const doc = await payload.create({
    collection,
    data: { uploader, public: false },
    file: {
      data: Buffer.from(image.bytes),
      mimetype: image.mimeType,
      name: `${randomBytes(12).toString('hex')}.${extensions[image.mimeType]}`,
      size: image.bytes.byteLength,
    },
    overrideAccess: true,
  })
  const saved = uploadedImage(doc)
  if (!saved) throw new Error('An uploaded picture has no address')
  return saved
}

/** Pictures the member uploaded this Shanghai day, used or not: at most `dailyImages`. */
export async function uploadsToday(payload: Payload, userId: string, now = new Date()): Promise<number> {
  const { totalDocs } = await payload.count({
    collection,
    where: { uploader: { equals: userId }, createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
    overrideAccess: true,
  })
  return totalDocs
}

/**
 * The member's own pictures among these file names and ids (a cover). A picture belongs to the
 * article it was first saved in: `articleId` null takes only unused ones, a number those and the
 * article's own, and leaving it out takes any (the preview). Missing ones are left out.
 */
export async function ownImages(
  payload: Payload,
  userId: string,
  { files, ids, articleId }: { files: string[]; ids: number[]; articleId?: number | null },
): Promise<ArticleImage[]> {
  const or: Where[] = []
  if (files.length > 0) or.push({ filename: { in: files } })
  if (ids.length > 0) or.push({ id: { in: ids } })
  if (or.length === 0) return []
  const and: Where[] = [{ or }, { uploader: { equals: userId } }]
  if (articleId === null) and.push({ article: { exists: false } })
  if (typeof articleId === 'number') and.push({ or: [{ article: { exists: false } }, { article: { equals: articleId } }] })
  const { docs } = await payload.find({ collection, where: { and }, depth: 0, pagination: false, overrideAccess: true })
  return docs
}

/**
 * Puts these pictures in the article, public as the article is, and deletes the ones it used
 * before and no longer does.
 */
export async function attachImages(payload: Payload, articleId: number, ids: number[], isPublic: boolean): Promise<void> {
  if (ids.length > 0) {
    await payload.update({ collection, where: { id: { in: ids } }, data: { article: articleId, public: isPublic }, overrideAccess: true })
  }
  await deleteImages(payload, { and: [{ article: { equals: articleId } }, ...(ids.length > 0 ? [{ id: { not_in: ids } }] : [])] })
}

/** Publishing an article shows its pictures; anything else takes them off the site. */
export async function setArticleImagesPublic(payload: Payload, articleId: number, isPublic: boolean, req?: PayloadRequest): Promise<void> {
  await payload.update({
    req,
    collection,
    where: { article: { equals: articleId }, public: { not_equals: isPublic } },
    data: { public: isPublic },
    overrideAccess: true,
  })
}

/** Deletes pictures and their files (R2 or the local folder). */
export async function deleteImages(payload: Payload, where: Where, req?: PayloadRequest): Promise<void> {
  await payload.delete({ req, collection, where, overrideAccess: true })
}
