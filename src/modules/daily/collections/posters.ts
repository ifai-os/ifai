import type { CollectionConfig } from 'payload'

import { posterEndpoints } from '../poster/endpoints'
import { isPosterDate, POSTER_MAX } from '../poster/rules'
import { refreshDailyCache } from '../review/cache'

const signedIn = ({ req: { user } }: { req: { user: unknown } }) => Boolean(user)

export const posterStatuses = ['draft', 'generated'] as const

/**
 * The daily poster (docs/specs/daily.md「流程」11, `posters`): one per Shanghai calendar day.
 * The editor arranges and generates it in the review screen's right column (「今日海报」,
 * backed by src/modules/daily/poster/). Until the editor changes it or generates it, the list
 * follows the automatic choice; the images and the poster page are drawn from `snapshot`,
 * frozen at generation, in all five languages.
 */
export const Posters: CollectionConfig = {
  slug: 'posters',
  labels: {
    singular: { en: 'Daily poster', zh: '每日海报' },
    plural: { en: 'Daily posters', zh: '每日海报' },
  },
  endpoints: posterEndpoints,
  admin: {
    useAsTitle: 'date',
    group: { en: 'Daily', zh: '日报' },
    defaultColumns: ['date', 'status', 'generatedAt'],
    description: {
      en: 'One per day (Shanghai time). Arrange and generate it in the review queue, right column.',
      zh: '每天一张（上海时间）。在审核队列的右栏编排和生成。',
    },
  },
  access: {
    // Readers see generated posters; drafts are for the back office.
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'generated' } }),
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  hooks: {
    // Deleting a poster in the admin takes its page and images down at once.
    afterDelete: [
      async ({ doc }) => {
        await refreshDailyCache()
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'date',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: { en: 'Date (Shanghai)', zh: '日期（上海时间）' },
      validate: (value: unknown) => (isPosterDate(value) ? true : 'YYYY-MM-DD'),
      admin: { readOnly: true },
    },
    {
      name: 'items',
      type: 'relationship',
      relationTo: 'stories',
      hasMany: true,
      maxRows: POSTER_MAX,
      label: { en: 'Stories, in order', zh: '条目（按顺序，第一条是头条）' },
      admin: { readOnly: true },
    },
    {
      name: 'arranged',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Arranged by the editor', zh: '已人工调整' },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: {
          en: 'After the first change or generation the list is no longer picked automatically; stories published later join while there is room.',
          zh: '调整过或生成过以后，不再按热度自动选；之后发布的新闻有空位才加进来。',
        },
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      label: { en: 'Status', zh: '状态' },
      options: [
        { value: 'draft', label: { en: 'Not generated', zh: '未生成' } },
        { value: 'generated', label: { en: 'Generated', zh: '已生成' } },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'generatedAt',
      type: 'date',
      label: { en: 'Generated at', zh: '生成时间' },
      admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      // What the five images and the poster page show (../poster/snapshot.ts).
      name: 'snapshot',
      type: 'json',
      label: { en: 'What the images show', zh: '图片上的内容' },
      admin: { hidden: true },
    },
  ],
}
