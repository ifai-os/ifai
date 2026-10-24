import type { CollectionConfig, UploadConfig } from 'payload'

import { isAdmin } from '@/modules/apps/collections/shared'

import { imageTypes, mediaRules } from '../rules'

type FileHandler = NonNullable<UploadConfig['handlers']>[number]

/**
 * Readers only ever get published pictures (see `read` below), so those can wait on a CDN for ten
 * minutes: a post the site owner hides stops showing its pictures within that. What an admin
 * opens can be anything and is not kept. Only files served from R2 go through here.
 */
const cacheHeaders: FileHandler = (req, { headers }) => {
  headers?.set('Cache-Control', req.user ? 'private, no-store' : 'public, max-age=86400, s-maxage=600')
}

const webp = (quality: number) => ({ format: 'webp' as const, options: { quality } })

/**
 * Pictures in circle posts and the covers of video links (docs/specs/circles.md rules 12 and 13),
 * in R2 under `circles/` (./circle-images locally). Members upload through
 * POST /api/circles/images, never here. Payload turns each one upright by its EXIF, drops all its
 * metadata (no `withMetadata`) and keeps WebP copies: the picture itself (2048 px at most), `feed`
 * (800 px, a post's only picture) and `square` (400 px, the grid). Animations stay animated.
 *
 * A picture is nobody's to see until its post is published (`public`); hiding the post takes that
 * back. The post and circle are plain numbers: posts live in a Drizzle table, so deleting a post,
 * a circle or a member deletes their pictures in code (../data.ts, ../admin.ts,
 * src/lib/auth/delete-member.ts), and ../media/cleanup.ts sweeps up what is left.
 */
export const CircleImages: CollectionConfig = {
  slug: 'circle-images',
  labels: {
    singular: { en: 'Circle picture', zh: '圈子图片' },
    plural: { en: 'Circle pictures', zh: '圈子图片' },
  },
  admin: {
    // Looked at in each circle's Posts tab, next to the post they belong to.
    hidden: true,
    group: { en: 'Circles', zh: '圈子' },
  },
  access: {
    // The files: an admin opens any, everyone else the published ones. The list is the back office's alone.
    read: ({ req: { user }, isReadingStaticFile }) => (user ? true : isReadingStaticFile ? { public: { equals: true } } : false),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  upload: {
    mimeTypes: [...imageTypes],
    resizeOptions: { width: mediaRules.maxSide, height: mediaRules.maxSide, fit: 'inside', withoutEnlargement: true },
    formatOptions: webp(82),
    imageSizes: [
      { name: 'square', width: 400, height: 400, fit: 'cover', withoutEnlargement: false, formatOptions: webp(78) },
      { name: 'feed', width: 800, height: 800, fit: 'inside', withoutEnlargement: true, formatOptions: webp(80) },
    ],
    adminThumbnail: 'square',
    crop: false,
    focalPoint: false,
    handlers: [cacheHeaders],
  },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'post',
      index: true,
      options: [
        { value: 'post', label: { en: 'In a post', zh: '动态里的图片' } },
        { value: 'cover', label: { en: 'Video cover', zh: '视频封面' } },
      ],
    },
    // The member who uploaded it (a Better Auth user id); none on covers.
    { name: 'uploader', type: 'text', index: true },
    { name: 'post', type: 'number', index: true },
    { name: 'circle', type: 'number', index: true },
    // Its place in the post, from 0.
    { name: 'position', type: 'number' },
    { name: 'public', type: 'checkbox', defaultValue: false, index: true },
  ],
}
