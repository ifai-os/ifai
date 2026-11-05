/**
 * Pictures straight from Cloudflare. With `R2_PUBLIC_URL` set (the bucket's public address, e.g.
 * https://media.ifai.io), the media collection's files are named by that address instead of
 * `/api/media/file/…`, so a picture never passes through a Vercel function or Vercel's image
 * optimisation: R2 charges nothing for what it serves and Cloudflare caches it in front.
 * Without it every file keeps going through Payload as before (local disk, previews without a
 * public bucket).
 */

/** The bucket's public address without a trailing slash, or null when it is not set or not an http(s) address. */
export function mediaPublicBase(value = process.env.R2_PUBLIC_URL): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null
  } catch {
    return null
  }
}

/**
 * A stored file's public address: the folder in the bucket (the collection's prefix, plus the
 * upload's own key when it has one) and the file's name, encoded as the bucket keys it.
 */
export function publicFileUrl(base: string, folder: string, filename: string): string {
  const path = [...folder.split('/').filter(Boolean).map(encodeURIComponent), encodeURIComponent(filename)].join('/')
  return `${base}/${path}`
}

/** Whether a media address is a whole URL (the public bucket) rather than one of this site's paths. */
export function isAbsoluteMediaUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

type SizedFile = { url?: string | null; width?: number | null } | null | undefined

/**
 * A `srcset` for a picture on the public bucket: Payload's smaller sizes (`thumb` 320, `card` 768,
 * src/collections/Media.ts) and the original, narrowest first, so the browser picks one for the
 * box instead of Vercel resizing it. Null for a picture served by this site (next/image handles those).
 */
export function mediaSrcSet(
  picture: { url: string; width: number },
  sizes: Record<string, SizedFile> | null | undefined,
): string | null {
  if (!isAbsoluteMediaUrl(picture.url)) return null
  const entries = new Map<number, string>()
  for (const size of Object.values(sizes ?? {})) {
    if (size?.url && size.width && size.width < picture.width && isAbsoluteMediaUrl(size.url)) entries.set(size.width, size.url)
  }
  entries.set(picture.width, picture.url)
  return [...entries]
    .sort(([a], [b]) => a - b)
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ')
}
