import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type PayloadRequest,
  type TextFieldSingleValidation,
} from 'payload'
import { text } from 'payload/shared'

import { rejectField } from '@/lib/field-error'
import { keepingRequest } from '@/lib/i18n/hant-sync'
import { inngest } from '@/lib/inngest/client'
import { isEmailAddress, normalizeEmail } from '@/modules/daily/email/address'

import { domainFromUrl, isHttpUrl } from '../normalize'
import { submissionEndpoints } from '../submissions/endpoints'
import { nextSubmissionSequence, submissionCode, submissionNotifyEvent } from '../submissions/rules'
import { adminMessage, appsAdminGroup, isAdmin, localeOptions } from './shared'

/** A relationship as stored (its id), whether the save brought the id or the populated document. */
function relationId(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'number') return value.id
  return undefined
}

/** Stop a save with a message on one field, in the admin language. */
function reject(req: PayloadRequest, path: string, message: { en: string; zh: string }): never {
  rejectField('app-submissions', path, adminMessage(req, message))
}

/**
 * "A-1021-07", set once on create: the Shanghai month and day plus the next number on that date
 * (../submissions/rules.ts). Two submissions in the same instant can pick the same number; the
 * unique index turns one away and the API tries again.
 */
const assignCode: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || data.code) return data
  const now = new Date()
  const prefix = submissionCode(now, 0).slice(0, -2)
  const { docs } = await keepingRequest(req, () =>
    req.payload.find({
      collection: 'app-submissions',
      where: { code: { like: prefix } },
      select: { code: true },
      pagination: false,
      depth: 0,
      req,
    }),
  )
  return { ...data, code: submissionCode(now, nextSubmissionSequence(docs.map((doc) => doc.code))) }
}

/** The domain follows the website, so the back office can spot an app that is already listed. */
const setDomain: CollectionBeforeChangeHook = ({ data }) =>
  typeof data.website === 'string' ? { ...data, domain: domainFromUrl(data.website) ?? null } : data

/**
 * What a new status needs before its email can go out: listed and duplicate link to a published
 * app; not listed gives the submitter the owner's reason.
 */
const guardStatus: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
  if (merged.status === originalDoc?.status) return data
  if (merged.status === 'rejected' && !(typeof merged.reply === 'string' && merged.reply.trim())) {
    reject(req, 'reply', {
      en: 'Write the note to the submitter first. The email tells them why.',
      zh: '先写好「给提交人的说明」：邮件里要告诉提交人原因。',
    })
  }
  if (merged.status === 'accepted' || merged.status === 'duplicate') {
    const id = relationId(merged.app)
    const app = id
      ? await keepingRequest(req, () => req.payload.findByID({ collection: 'apps', id, depth: 0, req }).catch(() => null))
      : null
    if (app?.status !== 'published') {
      reject(req, 'app', {
        en: 'Link a published app first. The email links to its page.',
        zh: '先关联一个已发布的应用：邮件里要链接它的页面。',
      })
    }
  }
  return data
}

/**
 * The submitter hears about every status they have not been told about yet: "received" when the
 * submission comes in, then the result (../submissions/jobs.ts). A send that fails here does not
 * stop the save; the hourly sweep, or the next save, sends it.
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

const validateWebsite: TextFieldSingleValidation = (value, args) => {
  const required = text(value, args)
  if (required !== true) return required
  return typeof value === 'string' && isHttpUrl(value.trim())
    ? true
    : adminMessage(args.req, { en: 'Enter a full address, starting with https://.', zh: '请填完整网址，以 https:// 开头。' })
}

const validateEmail: TextFieldSingleValidation = (value, args) => {
  const required = text(value, args)
  if (required !== true) return required
  return typeof value === 'string' && isEmailAddress(normalizeEmail(value))
    ? true
    : adminMessage(args.req, { en: 'Enter an email address that can receive mail.', zh: '请填一个能收邮件的地址。' })
}

const statusOptions = [
  { value: 'pending', label: { en: 'Pending', zh: '待审' } },
  { value: 'accepted', label: { en: 'Listed', zh: '已收录' } },
  { value: 'duplicate', label: { en: 'Already listed', zh: '重复' } },
  { value: 'rejected', label: { en: 'Not listed', zh: '未收录' } },
]

/**
 * Apps that members submit on「提交应用」(docs/specs/apps.md 5e). The owner lists one by
 * drafting it from the side panel, or marks it a duplicate or not listed; the submitter is told
 * by email.
 */
export const AppSubmissions: CollectionConfig = {
  slug: 'app-submissions',
  labels: {
    singular: { en: 'App submission', zh: '提交' },
    plural: { en: 'App submissions', zh: '提交' },
  },
  admin: {
    useAsTitle: 'code',
    group: appsAdminGroup,
    defaultColumns: ['code', 'name', 'domain', 'status', 'createdAt'],
    listSearchableFields: ['code', 'name', 'domain', 'email'],
    description: {
      en: 'Apps that members submitted. Open one and use Handling on the right: list it (makes a draft) or mark it a duplicate; to turn one down, set Not listed and write the note to the submitter. Each result is emailed to them.',
      zh: '会员在「提交应用」页提交的应用。打开一条，用右栏「处理」收录（生成草稿）或标为重复；不收录的，把状态改成「未收录」并写好给提交人的说明。结果都会发邮件告诉提交人。',
    },
  },
  defaultSort: '-createdAt',
  access: {
    read: isAdmin,
    // Members submit through POST /api/app-submissions/new, which checks and limits what they send.
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [assignCode, setDomain, guardStatus],
    afterChange: [queueEmail],
  },
  endpoints: submissionEndpoints,
  fields: [
    {
      name: 'handling',
      type: 'ui',
      admin: { position: 'sidebar', components: { Field: '/modules/apps/admin/submission-panel#SubmissionPanel' } },
    },
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
          en: 'Saving a new status emails the submitter. Listed and Already listed need a published app below; Not listed needs the note to the submitter.',
          zh: '改了状态并保存，就会发邮件告诉提交人。「已收录」「重复」要先关联已发布的应用，「未收录」要先写给提交人的说明。',
        },
      },
    },
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      index: true,
      label: { en: 'App', zh: '关联应用' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'The draft made from this submission, or the app it repeats. Once a linked draft is published, the submission becomes Listed by itself.',
          zh: '由这条提交生成的草稿，或者它重复的已有应用。关联的草稿发布后，这条提交自动改成「已收录」。',
        },
      },
    },
    {
      name: 'locale',
      type: 'select',
      defaultValue: 'en',
      label: { en: 'Email language', zh: '邮件语言' },
      options: localeOptions,
      admin: { position: 'sidebar', readOnly: true, description: { en: 'The language of the page it was sent from.', zh: '提交时所在页面的语言。' } },
    },
    {
      name: 'notifiedStatus',
      type: 'select',
      label: { en: 'Submitter was told', zh: '已通知提交人' },
      options: statusOptions,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: {
          en: 'The status of the last email the submitter got. When it differs from the status, saving sends the email again.',
          zh: '提交人最近一封邮件对应的状态；和上面的状态不同时，保存会再发一次。',
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
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', zh: '名称' },
    },
    {
      name: 'website',
      type: 'text',
      required: true,
      label: { en: 'Website', zh: '官网网址' },
      validate: validateWebsite,
    },
    {
      name: 'domain',
      type: 'text',
      index: true,
      label: { en: 'Domain', zh: '官网域名' },
      admin: { readOnly: true, description: { en: 'Taken from the website.', zh: '按官网网址自动取。' } },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'app-categories',
      label: { en: 'Category', zh: '分类' },
      admin: { description: { en: 'The submitter’s pick; optional.', zh: '提交人选的，可以不选。' } },
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'What it does', zh: '一句话说明' },
    },
    {
      name: 'email',
      type: 'text',
      required: true,
      label: { en: 'Contact email', zh: '联系邮箱' },
      validate: validateEmail,
    },
    {
      name: 'submitterId',
      type: 'text',
      index: true,
      label: { en: 'Submitter', zh: '提交人' },
      admin: { readOnly: true, description: { en: 'Site account id (Better Auth).', zh: '站点账号 id（Better Auth）。' } },
    },
    {
      name: 'reply',
      type: 'textarea',
      label: { en: 'Note to the submitter', zh: '给提交人的说明' },
      admin: {
        description: {
          en: 'Goes into the result email in your words, e.g. why it was not listed, and shows under「我的提交」. Write it in the email language.',
          zh: '原样写进结果邮件，也显示在提交人的「我的提交」里，比如没有收录的原因。用邮件语言写。',
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
