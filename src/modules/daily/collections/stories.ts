import type { CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { storyCategories } from '../categories'
import { reviewEndpoints } from '../review/endpoints'
import { heatTrends, sourceRoles, storyStatuses, type HeatTrend, type SourceRole, type StoryStatus } from '../story-fields'

export { heatTrends, sourceRoles, storyStatuses, type HeatTrend, type SourceRole, type StoryStatus } from '../story-fields'

const signedIn = ({ req: { user } }: { req: { user: unknown } }) => Boolean(user)

const statusLabels: Record<StoryStatus, { en: string; zh: string }> = {
  pending: { en: 'Pending review', zh: '待审' },
  published: { en: 'Published', zh: '已发布' },
  rejected: { en: 'Rejected', zh: '已拒绝' },
  merged: { en: 'Merged into another story', zh: '已并入' },
  withdrawn: { en: 'Withdrawn', zh: '已撤回' },
}

const categoryLabels = {
  product: { en: 'Product update', zh: '产品更新' },
  industry: { en: 'Industry', zh: '行业动态' },
  open: { en: 'Open models', zh: '开源模型' },
  design: { en: 'Image & design', zh: '图像与设计' },
  research: { en: 'Research', zh: '研究进展' },
} as const

const roleLabels: Record<SourceRole, { en: string; zh: string }> = {
  original: { en: 'Original', zh: '原文' },
  report: { en: 'Report', zh: '报道' },
  discussion: { en: 'Discussion', zh: '讨论' },
}

const trendLabels: Record<HeatTrend, { en: string; zh: string }> = {
  rising: { en: 'Rising', zh: '上升' },
  new: { en: 'New', zh: '新' },
}

const readOnly = { readOnly: true, position: 'sidebar' } as const

/** Localized text fields; zh-Hant is converted from zh-Hans on every zh-Hans save. */
const hantFields = ['title', 'summary', 'tryIt'] as const

/**
 * A written story (docs/specs/daily.md, `stories`). The writing job creates one per queued
 * report with title, summary and try-it in zh-Hans, en, ja and ko; zh-Hant is converted from
 * zh-Hans by the shared hook (AGENTS.md rule 4), so an editor's zh-Hans correction updates it
 * too. Review (the「审核队列」screen at /admin/collections/stories/review, backed by
 * `src/modules/daily/review/`) moves `status`, rewrites the other languages when the simplified
 * Chinese changed, sets the times and refreshes the site's cache.
 */
export const Stories: CollectionConfig = {
  slug: 'stories',
  labels: {
    singular: { en: 'Story', zh: '新闻' },
    plural: { en: 'Stories', zh: '新闻' },
  },
  hooks: {
    afterChange: [syncHantFromHans(hantFields)],
  },
  endpoints: reviewEndpoints,
  admin: {
    useAsTitle: 'title',
    group: { en: 'Daily', zh: '日报' },
    defaultColumns: ['title', 'category', 'status', 'score', 'publishedAt', 'review'],
    components: {
      beforeListTable: ['/modules/daily/admin/review/links#ReviewQueueButton'],
      views: {
        // The review screen (「IFAI 日报审核后台」board): queue on the left, one story in the middle.
        review: { Component: '/modules/daily/admin/review/view#ReviewQueueView', path: '/review', exact: true },
      },
    },
  },
  access: {
    // Readers see published stories; everything else is for the back office.
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'published' } }),
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  fields: [
    {
      name: 'review',
      type: 'ui',
      label: { en: 'Review', zh: '审核' },
      admin: {
        components: {
          Cell: '/modules/daily/admin/review/links#ReviewCell',
          Field: '/modules/daily/admin/review/links#ReviewField',
        },
      },
    },
    { name: 'title', type: 'text', required: true, localized: true, label: { en: 'Title', zh: '标题' } },
    { name: 'summary', type: 'textarea', required: true, localized: true, label: { en: 'Summary', zh: '摘要' } },
    {
      name: 'tryIt',
      type: 'textarea',
      localized: true,
      label: { en: 'Try it', zh: '试一试' },
      admin: { description: { en: 'Optional; shown at the end of the item.', zh: '选填，显示在条目末尾。' } },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          label: { en: 'Slug', zh: '网址 slug' },
          admin: { description: { en: 'English, shared by all languages.', zh: '英文，五种语言共用。' } },
        },
        {
          name: 'category',
          type: 'select',
          required: true,
          label: { en: 'Category', zh: '分类' },
          options: storyCategories.map((value) => ({ value, label: categoryLabels[value] })),
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          label: { en: 'Status', zh: '状态' },
          options: storyStatuses.map((value) => ({ value, label: statusLabels[value] })),
        },
      ],
    },
    {
      name: 'sources',
      type: 'array',
      label: { en: 'Sources', zh: '来源' },
      labels: { singular: { en: 'Source', zh: '来源' }, plural: { en: 'Sources', zh: '来源' } },
      admin: { description: { en: 'The original first.', zh: '原文在前。' } },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, label: { en: 'Publisher', zh: '发布方' } },
            {
              name: 'role',
              type: 'select',
              required: true,
              defaultValue: 'report',
              label: { en: 'Role', zh: '角色' },
              options: sourceRoles.map((value) => ({ value, label: roleLabels[value] })),
            },
          ],
        },
        { name: 'url', type: 'text', required: true, label: { en: 'URL', zh: '网址' } },
        {
          name: 'publishedAt',
          type: 'date',
          label: { en: 'Published', zh: '发布时间' },
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    { name: 'eventId', type: 'number', required: true, label: { en: 'Event', zh: '事件' }, admin: readOnly },
    {
      name: 'representativeItemId',
      type: 'number',
      required: true,
      unique: true,
      label: { en: 'Report (raw_items id)', zh: '来源报道（raw_items id）' },
      admin: readOnly,
    },
    { name: 'score', type: 'number', label: { en: 'AI score', zh: 'AI 评分' }, admin: readOnly },
    {
      name: 'heat',
      type: 'number',
      label: { en: 'Heat', zh: '热度' },
      admin: { ...readOnly, description: { en: "0–100, the event's heat; refreshed every hour.", zh: '0–100，所属事件的热度，每小时更新。' } },
    },
    {
      name: 'heatTrend',
      type: 'select',
      label: { en: 'Heat trend', zh: '热度走势' },
      options: heatTrends.map((value) => ({ value, label: trendLabels[value] })),
      admin: { ...readOnly, description: { en: 'Compared with 6 hours earlier.', zh: '和 6 小时前比较。' } },
    },
    {
      // Addresses of the event's reports and discussion threads already offered to the source
      // list (../heat/sources.ts), so one the editor removed is not added back.
      name: 'sourcesSeen',
      type: 'json',
      label: { en: 'Sources already considered', zh: '已同步过的来源' },
      admin: { hidden: true },
    },
    {
      name: 'flags',
      type: 'json',
      label: { en: 'Flags', zh: '标记' },
      admin: { ...readOnly, description: { en: 'promotional, tutorial, score_gap', zh: '疑似推广、教程类、两次评分差距大' } },
    },
    {
      name: 'verification',
      type: 'json',
      label: { en: 'Source check', zh: '原文核对' },
      admin: {
        ...readOnly,
        description: {
          en: 'Names and numbers in the text that were not found in the reports.',
          zh: '标题、摘要、试一试里在原文中找不到的名字和数字。',
        },
      },
    },
    {
      name: 'localeStatus',
      type: 'json',
      label: { en: 'Languages', zh: '各语言状态' },
      admin: { ...readOnly, description: { en: 'Which languages were written, and when.', zh: '哪些语言已写好，什么时候写的。' } },
    },
    { name: 'promptVersion', type: 'text', label: { en: 'Prompt version', zh: '提示词版本' }, admin: readOnly },
    {
      name: 'publishedAt',
      type: 'date',
      label: { en: 'Published at', zh: '发布时间' },
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'correctedAt',
      type: 'date',
      label: { en: 'Corrected at', zh: '更正时间' },
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'laterAt',
      type: 'date',
      label: { en: 'Set aside at', zh: '稍后再看' },
      admin: { ...readOnly, date: { pickerAppearance: 'dayAndTime' }, description: { en: 'Moves the story to the end of the queue.', zh: '设了就排到队列末尾。' } },
    },
    {
      name: 'mergedInto',
      type: 'number',
      label: { en: 'Merged into (story id)', zh: '并入的新闻（id）' },
      admin: readOnly,
    },
    {
      name: 'keptApartFrom',
      type: 'number',
      label: { en: 'Not the same as (story id)', zh: '不是同一件事（对方 id）' },
      admin: { ...readOnly, description: { en: 'The editor said it is not the same happening as this published story.', zh: '审核时确认过和这条已发布的新闻不是同一件事。' } },
    },
  ],
}
