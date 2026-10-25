import type { CollectionConfig, Where } from 'payload'

import { isAdmin, rankingsAdminGroup } from './shared'

/**
 * The pictures of the image arenas (docs/specs/rankings.md「图像生成赛道」), stored by the answer
 * job as soon as a contestant draws one; in R2 under arena/ when the R2_* variables are set, else
 * in ./arena-images. A vote shows the files, so a file loads for anyone who has its address, but
 * the documents stay in the back office: their order and times would tell which pictures came
 * from the same model. File names are random for the same reason.
 */
export const ArenaImages: CollectionConfig = {
  slug: 'arena-images',
  labels: {
    singular: { en: 'Picture', zh: '图' },
    plural: { en: 'Pictures', zh: '回答的图' },
  },
  admin: {
    group: rankingsAdminGroup,
    description: {
      en: 'The contestants’ pictures, stored by the answer job. To keep a picture out of the votes, hide its answer under Answers.',
      zh: '参赛模型画的图，由生成任务存进来。不想让哪张图出现在盲测里，到「回答」里把那份回答隐藏。',
    },
  },
  access: {
    // A file is served once Payload has found its document, which the storage adapter then reads
    // the file's folder from; listing or reading the documents is for the site owner.
    read: ({ req: { user }, isReadingStaticFile }): Where | boolean => Boolean(user) || (isReadingStaticFile ? { filename: { exists: true } } : false),
    // Only the answer job stores pictures, and a contestant's picture is never swapped for another.
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  upload: {
    // Checked against the file's own bytes: no SVG, which could carry script.
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    adminThumbnail: 'thumb',
    imageSizes: [
      { name: 'thumb', width: 320, formatOptions: { format: 'webp', options: { quality: 80 } } },
      // What a vote shows: at most 600px high on the page, twice that for sharp screens.
      { name: 'vote', width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true, formatOptions: { format: 'webp', options: { quality: 85 } } },
    ],
  },
  fields: [
    {
      name: 'answers',
      type: 'join',
      collection: 'arena-answers',
      on: 'image',
      label: { en: 'Answer', zh: '回答' },
      admin: { defaultColumns: ['id', 'model', 'prompt', 'hidden'] },
    },
  ],
}
