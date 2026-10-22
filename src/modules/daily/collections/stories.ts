import type { CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { storyCategories } from '../categories'

/** 待审 / 已发布 / 已拒绝 / 已并入 / 已撤回 (docs/specs/daily.md「数据」). */
export const storyStatuses = ['pending', 'published', 'rejected', 'merged', 'withdrawn'] as const
export type StoryStatus = (typeof storyStatuses)[number]

/** The original announcement comes first; reports and discussion threads follow. */
export const sourceRoles = ['original', 'report', 'discussion'] as const
export type SourceRole = (typeof sourceRoles)[number]

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

const readOnly = { readOnly: true, position: 'sidebar' } as const

/** Localized text fields; zh-Hant is converted from zh-Hans on every zh-Hans save. */
const hantFields = ['title', 'summary', 'tryIt'] as const

/**
 * A written story (docs/specs/daily.md, `stories`). The writing job creates one per queued
 * report with title, summary and try-it in zh-Hans, en, ja and ko; zh-Hant is converted from
 * zh-Hans by the shared hook (AGENTS.md rule 4), so an editor's zh-Hans correction updates it
 * too. The review flow (step 4) moves `status` and sets the times.
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
  admin: {
    useAsTitle: 'title',
    group: { en: 'Daily', zh: '日报' },
    defaultColumns: ['title', 'category', 'status', 'score', 'publishedAt'],
  },
  access: {
    // Readers see published stories; everything else is for the back office.
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'published' } }),
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  fields: [
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
    { name: 'heat', type: 'number', label: { en: 'Heat', zh: '热度' }, admin: readOnly },
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
  ],
}
