import type { Access, CollectionConfig, UploadConfig, Where } from 'payload'

import { isAdmin } from '@/modules/apps/collections/shared'

import { imageTypes, writeRules } from '../writing'
import { recommendAdminGroup } from './Articles'

type FileHandler = NonNullable<UploadConfig['handlers']>[number]

/**
 * Pictures of published articles can wait on a CDN for ten minutes: one the site owner hides
 * stops showing within that. A draft's pictures are for their author alone and are never kept.
 * Only files served from R2 go through here.
 */
const cacheHeaders: FileHandler = (_req, { doc, headers }) => {
  const shown = (doc as { public?: boolean | null }).public === true
  headers?.set('Cache-Control', shown ? 'public, max-age=86400, s-maxage=600' : 'private, no-store')
}

/**
 * Files: an admin opens any; a reader the published ones, and the member who uploaded a picture
 * also their own (to see a draft's preview). The list is the back office's alone.
 */
const read: Access = async ({ req, isReadingStaticFile }) => {
  if (req.user) return true
  if (!isReadingStaticFile) return false
  // Imported here: the sign-in setup is not needed to load the Payload config.
  const { auth } = await import('@/lib/auth/auth')
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null)
  const shown: Where = { public: { equals: true } }
  return session ? { or: [shown, { uploader: { equals: session.user.id } }] } : shown
}

const webp = (quality: number) => ({ format: 'webp' as const, options: { quality } })

/**
 * Readers' pictures in their articles: covers and pictures in the body (docs/specs/recommend.md
 * rule 14), in R2 under `articles/` (./article-images locally). Members upload through
 * POST /api/recommend/images, never here. Payload turns each one upright by its EXIF, drops all
 * its metadata (no `withMetadata`) and keeps WebP copies: the picture (2048 px at most), `card`
 * (768 px) and `thumb` (320 px), named as the media library's so pages read both the same way.
 *
 * A picture is public while its article is published (the `articles` hooks keep that in step);
 * deleting the article or the member deletes it.
 */
export const ArticleImages: CollectionConfig = {
  slug: 'article-images',
  labels: {
    singular: { en: 'Article picture', zh: '文章图片' },
    plural: { en: 'Article pictures', zh: '文章图片' },
  },
  admin: {
    // Seen in the articles they belong to.
    hidden: true,
    group: recommendAdminGroup,
  },
  access: {
    read,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  upload: {
    mimeTypes: [...imageTypes],
    resizeOptions: { width: writeRules.maxSide, height: writeRules.maxSide, fit: 'inside', withoutEnlargement: true },
    formatOptions: webp(82),
    imageSizes: [
      { name: 'thumb', width: 320, formatOptions: webp(78) },
      { name: 'card', width: 768, withoutEnlargement: true, formatOptions: webp(80) },
    ],
    adminThumbnail: 'thumb',
    crop: false,
    focalPoint: false,
    handlers: [cacheHeaders],
  },
  fields: [
    // The member who uploaded it (a Better Auth user id).
    { name: 'uploader', type: 'text', required: true, index: true },
    { name: 'article', type: 'number', index: true },
    { name: 'public', type: 'checkbox', defaultValue: false, index: true },
  ],
}
