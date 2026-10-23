import type { CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from 'payload'

import { appsAdminGroup, isAdmin } from './shared'

/** What the reader wrote stays as they wrote it: no one changes it through the API or the back office. */
const asWritten: FieldAccess = () => false

/** 「已处理」gets its time; reopening one clears it. */
const stampResolved: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data.status === 'resolved' && (originalDoc?.status !== 'resolved' || !originalDoc?.resolvedAt)) {
    return { ...data, resolvedAt: new Date().toISOString() }
  }
  if (data.status === 'open') return { ...data, resolvedAt: null }
  return data
}

/**
 * What readers report from an app's page with「信息有误？」(docs/specs/apps.md 5d). Dealt with
 * from the app's「报错」tab, where the owner can also delist an app that has shut down.
 */
export const AppReports: CollectionConfig = {
  slug: 'app-reports',
  labels: {
    singular: { en: 'App report', zh: '报错' },
    plural: { en: 'App reports', zh: '报错' },
  },
  admin: {
    group: appsAdminGroup,
    defaultColumns: ['app', 'kind', 'body', 'status', 'createdAt'],
    listSearchableFields: ['body', 'contact'],
    description: {
      en: 'What readers reported with “Something wrong?” on an app’s page. Easier to deal with from the app’s Reports tab: mark them done, or delist an app that has shut down.',
      zh: '读者在应用详情页「信息有误？」里报的问题。到应用的「报错」标签里处理更方便：标记完成，或者把已停运的应用下架。',
    },
  },
  defaultSort: '-createdAt',
  access: {
    read: isAdmin,
    // Readers report through POST /api/app-reports/new, which checks and limits what they send.
    create: () => false,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [stampResolved],
  },
  fields: [
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      required: true,
      index: true,
      label: { en: 'App', zh: '应用' },
      access: { update: asWritten },
      admin: { readOnly: true },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      label: { en: 'Problem', zh: '问题类型' },
      options: [
        { value: 'wrong-info', label: { en: 'Wrong information', zh: '资料有误' } },
        { value: 'shut-down', label: { en: 'Shut down', zh: '已停运' } },
        { value: 'other', label: { en: 'Other', zh: '其他' } },
      ],
      access: { update: asWritten },
      admin: { readOnly: true },
    },
    {
      name: 'body',
      type: 'textarea',
      label: { en: 'Details', zh: '说明' },
      access: { update: asWritten },
      admin: { readOnly: true },
    },
    {
      name: 'contact',
      type: 'text',
      label: { en: 'How to reach them', zh: '联系方式' },
      access: { update: asWritten },
      admin: { readOnly: true, description: { en: 'Optional; never shown on the site.', zh: '选填，不在站上公开。' } },
    },
    {
      name: 'pageLocale',
      type: 'select',
      label: { en: 'Page language', zh: '页面语言' },
      options: [
        { value: 'en', label: { en: 'English', zh: '英语' } },
        { value: 'zh-Hans', label: { en: 'Simplified Chinese', zh: '简体中文' } },
        { value: 'zh-Hant', label: { en: 'Traditional Chinese', zh: '繁体中文' } },
        { value: 'ja', label: { en: 'Japanese', zh: '日语' } },
        { value: 'ko', label: { en: 'Korean', zh: '韩语' } },
      ],
      access: { update: asWritten },
      admin: { readOnly: true, description: { en: 'The language of the page they reported from.', zh: '读者报错时看的是哪种语言的页面。' } },
    },
    {
      // `u:<member id>`, or `v:<the day's visitor hash>` (src/lib/visitor.ts): for the daily limit, never shown.
      name: 'reporter',
      type: 'text',
      required: true,
      index: true,
      access: { update: asWritten },
      admin: { hidden: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      index: true,
      label: { en: 'Status', zh: '状态' },
      options: [
        { value: 'open', label: { en: 'Not dealt with', zh: '待处理' } },
        { value: 'resolved', label: { en: 'Dealt with', zh: '已处理' } },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'resolvedAt',
      type: 'date',
      label: { en: 'Dealt with on', zh: '处理时间' },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
