import type { CollectionConfig } from 'payload'

/** Images and files. Stored in Cloudflare R2 when the R2_* variables are set, else in ./media locally. */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: { en: 'Media', zh: '媒体文件' },
    plural: { en: 'Media', zh: '媒体文件' },
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
      label: { en: 'Alt text', zh: '替代文字' },
    },
  ],
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumb', width: 320 },
      { name: 'card', width: 768 },
    ],
  },
}
