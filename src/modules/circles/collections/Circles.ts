import type { CollectionAfterDeleteHook, CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'
import { isAdmin, slugField } from '@/modules/apps/collections/shared'

import { deleteCircleData } from '../admin'
import { refreshCirclesAfterChange, refreshCirclesAfterDelete } from '../cache'
import { circleEndpoints } from '../endpoints'
import { circleTones } from '../rules'

/** The color names of the seven tile tones (src/app/(frontend)/globals.css). */
const toneLabels = [
  { en: 'Ink', zh: '墨色' },
  { en: 'Blue', zh: '蓝' },
  { en: 'Sand', zh: '沙' },
  { en: 'Green', zh: '绿' },
  { en: 'Lavender', zh: '淡紫' },
  { en: 'Amber', zh: '琥珀' },
  { en: 'Rose', zh: '玫瑰' },
]

const deletePosts: CollectionAfterDeleteHook = async ({ id, req }) => {
  await deleteCircleData(req.payload, Number(id))
}

/**
 * The circles members post in (docs/specs/circles.md). The site owner makes them; readers join
 * them and post. Hiding one takes it and its posts off the page; deleting one deletes its posts.
 */
export const Circles: CollectionConfig = {
  slug: 'circles',
  labels: {
    singular: { en: 'Circle', zh: '圈子' },
    plural: { en: 'Circles', zh: '圈子' },
  },
  admin: {
    useAsTitle: 'name',
    group: { en: 'Circles', zh: '圈子' },
    defaultColumns: ['name', 'slug', 'tone', 'order', 'shown'],
    components: {
      beforeListTable: ['/modules/circles/admin/post-reports#PostReports'],
    },
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Write English, Japanese and Korean separately. Readers’ posts and comments go live at once: hide one in the circle’s Posts or Comments tab.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。读者的动态和评论直接发布，违规的在圈子的「动态」「评论」标签里隐藏。',
    },
  },
  defaultSort: 'order',
  access: {
    read: ({ req: { user } }) => (user ? true : { shown: { equals: true } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncHantFromHans(['name', 'description']), refreshCirclesAfterChange],
    afterDelete: [deletePosts, refreshCirclesAfterDelete],
  },
  endpoints: circleEndpoints,
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Circle', zh: '圈子' },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              localized: true,
              label: { en: 'Name', zh: '名称' },
              admin: { description: { en: 'Shown as “# name”.', zh: '页面上显示成「# 名称」。' } },
            },
            {
              name: 'description',
              type: 'text',
              localized: true,
              maxLength: 60,
              label: { en: 'One-line description', zh: '一句话介绍' },
              admin: {
                description: {
                  en: 'What people post here, for the circle’s card and search engines.',
                  zh: '大家在这里发什么，用在圈子卡片的读屏说明和搜索引擎里。',
                },
              },
            },
          ],
        },
        {
          label: { en: 'Posts', zh: '动态' },
          description: {
            en: 'Readers’ posts go live at once. Hide one that breaks the rules; reported ones are marked.',
            zh: '读者的动态直接发布。违规的可以隐藏；被举报的会标出来。',
          },
          fields: [
            {
              name: 'postsPanel',
              type: 'ui',
              admin: { components: { Field: '/modules/circles/admin/posts-panel#PostsPanel' } },
            },
          ],
        },
        {
          label: { en: 'Comments', zh: '评论' },
          description: {
            en: 'Comments on the posts go live at once. Hiding one hides the replies under it too; reported ones are marked.',
            zh: '动态下的评论直接发布。隐藏一条评论，它下面的回复也一起不显示；被举报的会标出来。',
          },
          fields: [
            {
              name: 'commentsPanel',
              type: 'ui',
              admin: { components: { Field: '/modules/circles/admin/comments-panel#CommentsPanel' } },
            },
          ],
        },
      ],
    },
    slugField({ from: 'name' }),
    {
      name: 'tone',
      type: 'select',
      required: true,
      defaultValue: '3',
      label: { en: 'Color', zh: '颜色' },
      options: circleTones.map((tone) => ({ value: String(tone), label: toneLabels[tone] })),
      admin: {
        position: 'sidebar',
        description: { en: 'The card’s color, from the design tokens.', zh: '圈子卡片的颜色，取自设计令牌。' },
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: { en: 'Order', zh: '排序' },
      admin: {
        position: 'sidebar',
        description: { en: 'Smaller comes first.', zh: '数字越小越靠前。' },
      },
    },
    {
      name: 'shown',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Shown', zh: '显示' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Unticked, the circle and its posts leave the page and nobody can post in it. Nothing is deleted.',
          zh: '不勾时圈子和里面的动态都不在页面上出现，也不能再发。什么都不删。',
        },
      },
    },
  ],
}
