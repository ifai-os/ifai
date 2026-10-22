import type { Payload } from 'payload'
import sharp from 'sharp'

import { errorMessage } from '@/modules/daily/collect/fetch'

import type { Material } from './collect'
import { fetchPublic, type FetchDeps } from './fetch'
import type { IconCandidate } from './material'

/**
 * The app's own icon and share image (docs/specs/apps.md rule 6), downloaded once and kept in
 * Media (R2 in production). An icon that cannot be read leaves the initial-letter tile.
 */

const IMAGE_ACCEPT = 'image/avif, image/webp, image/png, image/svg+xml, image/*;q=0.8'
const MAX_ICON_BYTES = 1024 * 1024
const MAX_SHARE_IMAGE_BYTES = 5 * 1024 * 1024
/** Smaller share images are logos or tracking pixels, not a picture of the app. */
const MIN_SHARE_IMAGE_WIDTH = 300
const MIN_ICON_SIDE = 16
const MAX_ICONS_TRIED = 4

const rasterTypes: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heif: 'image/avif',
  tiff: 'image/tiff',
}

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
}

/** A downloaded image. Width and height are known for raster images only. */
export type Image = { bytes: Uint8Array; mimeType: string; width: number | null; height: number | null }

/** Rank: apple-touch-icon, then large icons, then SVG, then small icons and .ico files. */
function rank(icon: IconCandidate): number {
  const svg = icon.size === Infinity || icon.type === 'image/svg+xml'
  if (icon.kind === 'apple-touch-icon') return 3000 + Math.min(icon.size || 180, 1024)
  if (!svg && icon.size >= 96) return 2000 + Math.min(icon.size, 1024)
  if (svg) return 1500
  if (/\.ico(?:$|\?)/i.test(icon.url) || icon.type.includes('icon')) return icon.size / 10
  return icon.size >= 32 ? 1000 + icon.size : icon.size
}

/** Icon URLs to try, best first; the usual root paths come last. */
export function iconCandidates(material: Pick<Material, 'icons' | 'url'>): string[] {
  const urls = [...material.icons].sort((a, b) => rank(b) - rank(a)).map((icon) => icon.url)
  urls.push(new URL('/apple-touch-icon.png', material.url).toString(), new URL('/favicon.ico', material.url).toString())
  return [...new Set(urls)].slice(0, MAX_ICONS_TRIED + 2)
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase()
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))
}

const isIco = (bytes: Uint8Array) => bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0

/** What the bytes are, read from the bytes themselves; null when they are not an image we keep. */
export async function identifyImage(bytes: Uint8Array): Promise<Image | null> {
  if (bytes.byteLength === 0) return null
  if (isIco(bytes)) return { bytes, mimeType: 'image/x-icon', width: null, height: null }
  if (looksLikeSvg(bytes)) return { bytes, mimeType: 'image/svg+xml', width: null, height: null }
  try {
    const { format, width, height } = await sharp(bytes).metadata()
    const mimeType = format ? rasterTypes[format] : undefined
    if (!mimeType || !width || !height) return null
    return { bytes, mimeType, width, height }
  } catch {
    return null
  }
}

/** SVG and .ico icons are kept as they are; a raster icon needs at least 16 px on each side. */
const usableIcon = (image: Image) =>
  image.width === null || image.height === null || Math.min(image.width, image.height) >= MIN_ICON_SIDE

async function download(url: string, maxBytes: number, deps: FetchDeps): Promise<Image | null> {
  const { bytes } = await fetchPublic(url, { accept: IMAGE_ACCEPT, maxBytes, timeoutMs: 10_000 }, deps)
  return identifyImage(bytes)
}

/** The first icon that downloads as a usable image. */
export async function findIcon(material: Pick<Material, 'icons' | 'url'>, deps: FetchDeps = {}): Promise<{ image: Image; url: string } | { reason: string }> {
  const reasons: string[] = []
  for (const url of iconCandidates(material)) {
    try {
      const image = await download(url, MAX_ICON_BYTES, deps)
      if (image && usableIcon(image)) return { image, url }
      reasons.push(`${url}: not an icon`)
    } catch (error) {
      reasons.push(`${url}: ${errorMessage(error)}`)
    }
  }
  return { reason: reasons.join('; ').slice(0, 500) || 'no icon on the page' }
}

/** The share image when it is a real picture (raster, at least 300 px wide). */
export async function findShareImage(material: Pick<Material, 'image'>, deps: FetchDeps = {}): Promise<{ image: Image; url: string } | { reason: string }> {
  if (!material.image) return { reason: 'no og:image on the page' }
  try {
    const image = await download(material.image, MAX_SHARE_IMAGE_BYTES, deps)
    if (!image || image.width === null) return { reason: `${material.image}: not a picture` }
    if (image.width < MIN_SHARE_IMAGE_WIDTH) return { reason: `${material.image}: too small` }
    return { image, url: material.image }
  } catch (error) {
    return { reason: `${material.image}: ${errorMessage(error)}` }
  }
}

/** Store an image in Media; returns its id. */
export async function saveImage(payload: Payload, image: Image, { alt, name }: { alt: string; name: string }): Promise<number> {
  const filename = `${name}.${extensions[image.mimeType] ?? 'img'}`
  const media = await payload.create({
    collection: 'media',
    data: { alt },
    file: { data: Buffer.from(image.bytes), mimetype: image.mimeType, name: filename, size: image.bytes.byteLength },
  })
  return media.id
}
