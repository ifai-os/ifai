import { randomBytes } from 'node:crypto'

import type { Payload, Where } from 'payload'
import sharp from 'sharp'

import type { CircleImage } from '@/payload-types'
import { shanghaiDayStart } from '@/lib/shanghai-day'
import { fetchPublic, type FetchDeps } from '@/modules/apps/profile/fetch'

import { imageTypes, mediaRules, type PostImage } from '../rules'

/**
 * Pictures in posts and video covers, kept in the `circle-images` upload collection
 * (../collections/CircleImages.ts; docs/specs/circles.md rule 12). Works on the Payload instance
 * it is given, like ../data.ts.
 */

const collection = 'circle-images'

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
    const { format, width, height, pages } = await sharp(bytes, { limitInputPixels: mediaRules.maxPixels }).metadata()
    const mimeType = format ? formats[format] : undefined
    if (!mimeType || !width || !height) return null
    if (width * height > mediaRules.maxPixels || width * height * (pages ?? 1) > maxAnimatedPixels) return null
    return { mimeType, width, height }
  } catch {
    return null
  }
}

type NewImage = { kind: 'post'; uploader: string } | { kind: 'cover' }

/**
 * Stores a picture under a random name: the reader's own file name never shows. Payload turns it
 * upright, drops its metadata and makes the WebP copies. A cover is public at once; a post's
 * picture once the post is published.
 */
export async function saveImage(
  payload: Payload,
  image: { bytes: Uint8Array; mimeType: ImageType },
  data: NewImage,
): Promise<{ id: number; width: number; height: number }> {
  const doc = await payload.create({
    collection,
    data: { ...data, public: data.kind === 'cover' },
    file: {
      data: Buffer.from(image.bytes),
      mimetype: image.mimeType,
      name: `${randomBytes(12).toString('hex')}.${extensions[image.mimeType]}`,
      size: image.bytes.byteLength,
    },
    overrideAccess: true,
  })
  return { id: doc.id, width: doc.width ?? 0, height: doc.height ?? 0 }
}

/** Pictures the member uploaded this Shanghai day, posted or not: at most `dailyImages`. */
export async function uploadsToday(payload: Payload, userId: string, now = new Date()): Promise<number> {
  const { totalDocs } = await payload.count({
    collection,
    where: { uploader: { equals: userId }, createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
    overrideAccess: true,
  })
  return totalDocs
}

/** The first cover that downloads as a picture at least 160 px wide; its id, or null. */
export async function saveCover(payload: Payload, urls: string[], deps: FetchDeps = {}): Promise<number | null> {
  for (const url of urls.slice(0, 3)) {
    try {
      const { bytes } = await fetchPublic(url, { accept: 'image/webp, image/jpeg, image/*;q=0.8', maxBytes: 5 * 1024 * 1024, timeoutMs: 8_000 }, deps)
      const image = await inspectImage(bytes)
      if (!image || image.width < 160) continue
      return (await saveImage(payload, { bytes, mimeType: image.mimeType }, { kind: 'cover' })).id
    } catch {
      // The next one, else no cover.
    }
  }
  return null
}

/** True when every id is a picture this member uploaded and has not posted yet. */
export async function claimable(payload: Payload, ids: number[], userId: string): Promise<boolean> {
  if (ids.length === 0) return true
  const { totalDocs } = await payload.count({
    collection,
    where: { id: { in: ids }, kind: { equals: 'post' }, uploader: { equals: userId }, post: { exists: false } },
    overrideAccess: true,
  })
  return totalDocs === ids.length
}

/** Puts the pictures in the published post, in this order, and makes them public. */
export async function attachImages(payload: Payload, ids: number[], post: { postId: number; circleId: number }): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await payload.update({
      collection,
      id,
      data: { post: post.postId, circle: post.circleId, position, public: true },
      overrideAccess: true,
    })
  }
}

/** Hiding a post takes its pictures off the site; showing it again puts them back. */
export async function setPostImagesPublic(payload: Payload, postId: number, isPublic: boolean): Promise<void> {
  await payload.update({ collection, where: { post: { equals: postId } }, data: { public: isPublic }, overrideAccess: true })
}

/** Deletes pictures and their files (R2 or the local folder). */
export async function deleteImages(payload: Payload, where: Where): Promise<void> {
  await payload.delete({ collection, where, overrideAccess: true })
}

type ImageDoc = Pick<CircleImage, 'id' | 'post' | 'position' | 'url' | 'width' | 'height' | 'sizes'>

const toView = (doc: ImageDoc): PostImage | null => {
  if (!doc.url) return null
  return {
    id: doc.id,
    square: doc.sizes?.square?.url || doc.url,
    feed: doc.sizes?.feed?.url || doc.url,
    full: doc.url,
    width: doc.width ?? 0,
    height: doc.height ?? 0,
  }
}

/** The pictures of these posts in their order, and these covers (`feed` size), by id. */
export async function imageViews(
  payload: Payload,
  { postIds, coverIds }: { postIds: number[]; coverIds: number[] },
): Promise<{ byPost: Map<number, PostImage[]>; covers: Map<number, string> }> {
  const byPost = new Map<number, PostImage[]>()
  const covers = new Map<number, string>()
  const or: Where[] = []
  if (postIds.length > 0) or.push({ post: { in: postIds } })
  if (coverIds.length > 0) or.push({ id: { in: coverIds } })
  if (or.length === 0) return { byPost, covers }
  // Whole documents: the addresses are made on reading, from the file names and the R2 prefix.
  const { docs } = await payload.find({ collection, where: { or }, sort: 'position', depth: 0, pagination: false, overrideAccess: true })
  for (const doc of docs) {
    const view = toView(doc)
    if (!view) continue
    if (coverIds.includes(doc.id)) covers.set(doc.id, view.feed)
    if (doc.post && postIds.includes(doc.post)) byPost.set(doc.post, [...(byPost.get(doc.post) ?? []), view])
  }
  return { byPost, covers }
}
