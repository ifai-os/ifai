import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { shanghaiDayStart, submissionCode } from '../normalize'
import { isAdmin, resourcesAdminGroup, urlValidation } from './shared'

/** "S-1022-07": today's Shanghai date plus that day's sequence, set once on create. */
const assignCode: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || data.code) return data
  const now = new Date()
  const { totalDocs } = await req.payload.count({
    collection: 'skill-submissions',
    where: { createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
    req,
  })
  return { ...data, code: submissionCode(now, totalDocs + 1) }
}

/**
 * Skills that visitors suggest (docs/specs/resources.md, rule 12): a repository address and a
 * line of context. The owner imports and reviews; the submitter is told by email.
 */
export const SkillSubmissions: CollectionConfig = {
  slug: 'skill-submissions',
  labels: {
    singular: { en: 'Skill submission', zh: 'Skill 投稿' },
    plural: { en: 'Skill submissions', zh: 'Skill 投稿' },
  },
  admin: {
    useAsTitle: 'code',
    group: resourcesAdminGroup,
    defaultColumns: ['code', 'repository', 'status', 'createdAt'],
    listSearchableFields: ['code', 'repository', 'email'],
  },
  defaultSort: '-createdAt',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [assignCode],
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      unique: true,
      index: true,
      label: { en: 'Number', zh: '编号' },
      admin: { position: 'sidebar', readOnly: true, description: { en: 'Set automatically.', zh: '自动生成。' } },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      label: { en: 'Status', zh: '状态' },
      options: [
        { value: 'pending', label: { en: 'Pending', zh: '待处理' } },
        { value: 'accepted', label: { en: 'Listed', zh: '已收录' } },
        { value: 'rejected', label: { en: 'Not listed', zh: '已拒绝' } },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'skill',
      type: 'relationship',
      relationTo: 'skills',
      label: { en: 'Listed as', zh: '收录为' },
      admin: { position: 'sidebar', description: { en: 'The Skill created from this submission.', zh: '由这条投稿导入的 Skill。' } },
    },
    {
      name: 'repository',
      type: 'text',
      required: true,
      label: { en: 'Repository', zh: '仓库地址' },
      validate: urlValidation(true),
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'What it does', zh: '一句话说明' },
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      label: { en: 'Contact email', zh: '联系邮箱' },
    },
    {
      name: 'submitterId',
      type: 'text',
      label: { en: 'Submitter', zh: '提交人' },
      admin: { readOnly: true, description: { en: 'Site account id (Better Auth).', zh: '站点账号 id（Better Auth）。' } },
    },
    {
      name: 'adminNote',
      type: 'textarea',
      label: { en: 'Handling note', zh: '处理备注' },
      admin: { description: { en: 'Internal. Not shown to the submitter.', zh: '内部备注，不发给提交人。' } },
    },
  ],
}
