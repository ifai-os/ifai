import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { localeNames, locales } from '@/i18n/config'
import { inngest } from '@/lib/inngest/client'

import { nextSubmissionSequence, submissionCode } from '../normalize'
import { submissionNotifyEvent } from '../submit/rules'
import { peek, reject, relationId } from './guards'
import { isAdmin, resourcesAdminGroup, urlValidation } from './shared'

/**
 * "S-1022-07": the Shanghai month and day plus the next number on that date, set once on create.
 * Numbers continue from the highest one on that date, other years included since the code has no
 * year, so a new number never collides with one in use, even after a deletion.
 */
const assignCode: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || data.code) return data
  const now = new Date()
  const prefix = submissionCode(now, 0).slice(0, -2)
  const { docs } = await req.payload.find({
    collection: 'skill-submissions',
    where: { code: { like: prefix } },
    select: { code: true },
    pagination: false,
    depth: 0,
    req,
  })
  return { ...data, code: submissionCode(now, nextSubmissionSequence(docs.map((doc) => doc.code))) }
}

/**
 * The submitter hears about every status they have not been told about yet: "received" when the
 * submission comes in, then the result (../submit/jobs.ts). A send that fails here does not stop
 * the save; the hourly sweep, or the next save, sends it.
 */
const queueEmail: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (doc.status === doc.notifiedStatus) return doc
  try {
    await inngest.send({ name: submissionNotifyEvent, data: { id: doc.id } })
  } catch (error) {
    req.payload.logger.warn(`${submissionNotifyEvent} not sent for ${doc.code}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return doc
}

/** Listed means there is a page to link to: moving a submission to "Listed" needs a published Skill under "Imported as". */
const guardListing: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
  if (merged.status !== 'accepted' || originalDoc?.status === 'accepted') return data
  const skill = await peek(req, 'skills', relationId(merged.skill))
  if (skill?.status !== 'published') {
    reject(req, 'skill-submissions', 'skill', {
      en: 'Pick the published Skill first: the email links to its page.',
      zh: '先选好已发布的 Skill：邮件里要链接它的页面。',
    })
  }
  return data
}

const statusOptions = [
  { value: 'pending', label: { en: 'Pending', zh: '待处理' } },
  { value: 'accepted', label: { en: 'Listed', zh: '已收录' } },
  { value: 'rejected', label: { en: 'Not listed', zh: '已拒绝' } },
]

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
    beforeChange: [assignCode, guardListing],
    afterChange: [queueEmail],
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
      options: statusOptions,
      admin: {
        position: 'sidebar',
        description: {
          en: 'Saving "Listed" or "Not listed" emails the submitter, with your note to them.',
          zh: '改成「已收录」或「已拒绝」并保存，就会发邮件告诉投稿人，附上「给投稿人的说明」。',
        },
      },
    },
    {
      name: 'skill',
      type: 'relationship',
      relationTo: 'skills',
      label: { en: 'Imported as', zh: '导入为' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'The Skill imported from this submission. Listed: its page is in the email. Not listed after a blocked scan: the email lists what the scan found.',
          zh: '由这条投稿导入的 Skill。收录时，邮件里附上它的页面；检测拦截后拒绝时，邮件里列出检测发现的问题。',
        },
      },
    },
    {
      name: 'locale',
      type: 'select',
      defaultValue: 'en',
      label: { en: 'Email language', zh: '邮件语言' },
      options: locales.map((code) => ({ value: code, label: localeNames[code] })),
      admin: { position: 'sidebar', readOnly: true, description: { en: 'The language of the page it was sent from.', zh: '投稿时所在页面的语言。' } },
    },
    {
      name: 'notifiedStatus',
      type: 'select',
      label: { en: 'Submitter was told', zh: '已通知投稿人' },
      options: statusOptions,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: {
          en: 'The status of the last email the submitter got. When it differs from the status, saving sends the email again.',
          zh: '投稿人最近一封邮件对应的状态；和上面的状态不同时，保存会再发一次。',
        },
      },
    },
    {
      name: 'notifiedAt',
      type: 'date',
      label: { en: 'Emailed on', zh: '邮件发送时间' },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
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
      name: 'reply',
      type: 'textarea',
      label: { en: 'Note to the submitter', zh: '给投稿人的说明' },
      admin: {
        description: {
          en: 'Goes into the result email in your words, e.g. why it was not listed. Write it in the submitter’s language.',
          zh: '原样写进结果邮件，比如没有收录的原因。用投稿人的语言写。',
        },
      },
    },
    {
      name: 'adminNote',
      type: 'textarea',
      label: { en: 'Handling note', zh: '处理备注' },
      admin: { description: { en: 'Internal. Not shown to the submitter.', zh: '内部备注，不发给提交人。' } },
    },
  ],
}
