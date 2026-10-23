import { ValidationError, type Access, type CollectionBeforeChangeHook, type CollectionConfig, type Where } from 'payload'

import { localeNames, locales } from '@/i18n/config'
import { isTimeZone } from '@/lib/local-time'

import { subscriberEndpoints } from '../email/endpoints'

const signedIn = ({ req: { user } }: { req: { user: unknown } }) => Boolean(user)
/** Written by the subscribe box, the manage page and the email jobs, never typed in the admin. */
const systemOnly = { update: () => false }

/** A bounce or complaint is kept so the address is never written to again; anything else may go. */
const notSuppressed: Where = { or: [{ status: { not_equals: 'stopped' } }, { stopReason: { equals: 'owner' } }] }
const deletable: Access = ({ req: { user } }) => (user ? notSuppressed : false)

export const subscriberStatuses = ['subscribed', 'unsubscribed', 'stopped'] as const
export const stopReasons = ['bounce', 'complaint', 'owner'] as const

export type SubscriberStatus = (typeof subscriberStatuses)[number]
export type StopReason = (typeof stopReasons)[number]

/**
 * What the owner may change on a subscriber (docs/specs/daily-email.md「后台」): stop sending,
 * or take back a stop of their own. Unsubscribing and resubscribing belong to the reader, and a
 * bounce or complaint stays until the reader lifts it from the manage page. Writes from our own
 * code (no admin on the request) pass untouched.
 */
const ownerChanges: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !req.user || !originalDoc || !data.status || data.status === originalDoc.status) return data
  if (data.status === 'stopped') return { ...data, stopReason: 'owner' }
  if (data.status === 'subscribed' && originalDoc.status === 'stopped' && originalDoc.stopReason === 'owner') {
    return { ...data, stopReason: null }
  }
  // On the status field, in the admin's language.
  throw new ValidationError({
    collection: 'subscribers',
    errors: [
      {
        path: 'status',
        message:
          req.i18n?.language === 'en'
            ? 'The owner can only stop sending, or undo their own stop. Readers unsubscribe and resubscribe from the links in the emails.'
            : '站长只能停发，或者撤销自己的停发。退订和重新订阅由读者用邮件里的链接操作。',
      },
    ],
  })
}

/**
 * Readers of the daily email (docs/specs/daily-email.md「数据」), one per address. Created by the
 * subscribe boxes only: the owner can stop someone here but cannot subscribe anyone or change an
 * address. The subscribe time and page are the record of consent.
 */
export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  labels: {
    singular: { en: 'Subscriber', zh: '订阅者' },
    plural: { en: 'Subscribers', zh: '订阅者' },
  },
  endpoints: subscriberEndpoints,
  admin: {
    useAsTitle: 'email',
    group: { en: 'Daily', zh: '日报' },
    defaultColumns: ['email', 'locale', 'timeZone', 'status', 'subscribedAt', 'lastSentAt'],
    listSearchableFields: ['email'],
    components: {
      beforeListTable: ['/modules/daily/email/admin/subscriber-counts#SubscriberCounts'],
    },
    description: {
      en: 'The daily email goes out at 8 a.m. in each subscriber’s own time zone. Readers change their language and time zone, or unsubscribe, from the links in the emails; here you can only stop sending to someone.',
      zh: '邮件在每位订阅者当地时间早上 8 点发出。读者用邮件里的链接改语言、时区或退订；这里只能停发某个人。',
    },
  },
  access: {
    read: signedIn,
    create: () => false,
    update: signedIn,
    delete: deletable,
  },
  hooks: {
    beforeChange: [ownerChanges],
  },
  fields: [
    {
      name: 'email',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: { en: 'Email', zh: '邮箱' },
      access: systemOnly,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'locale',
          type: 'select',
          required: true,
          options: locales.map((value) => ({ value, label: localeNames[value] })),
          label: { en: 'Language', zh: '语言' },
          admin: { width: '50%' },
        },
        {
          name: 'timeZone',
          type: 'text',
          required: true,
          defaultValue: 'UTC',
          label: { en: 'Time zone', zh: '时区' },
          validate: (value: unknown) => (typeof value === 'string' && isTimeZone(value) ? true : 'IANA, e.g. Asia/Tokyo'),
          admin: { width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'subscribed',
          index: true,
          options: [
            { value: 'subscribed', label: { en: 'Subscribed', zh: '已订阅' } },
            { value: 'unsubscribed', label: { en: 'Unsubscribed', zh: '已退订' } },
            { value: 'stopped', label: { en: 'Stopped', zh: '已停发' } },
          ],
          label: { en: 'Status', zh: '状态' },
          admin: { width: '50%' },
        },
        {
          name: 'stopReason',
          type: 'select',
          options: [
            { value: 'bounce', label: { en: 'Bounced', zh: '退信' } },
            { value: 'complaint', label: { en: 'Marked as spam', zh: '投诉' } },
            { value: 'owner', label: { en: 'Stopped by the owner', zh: '站长停发' } },
          ],
          label: { en: 'Why stopped', zh: '停发原因' },
          access: systemOnly,
          admin: { width: '50%', condition: (data) => data?.status === 'stopped' },
        },
      ],
    },
    {
      name: 'sourcePage',
      type: 'text',
      label: { en: 'Subscribed on', zh: '订阅的页面' },
      access: systemOnly,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'subscribedAt',
          type: 'date',
          index: true,
          label: { en: 'Subscribed', zh: '订阅时间' },
          access: systemOnly,
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'unsubscribedAt',
          type: 'date',
          index: true,
          label: { en: 'Unsubscribed', zh: '退订时间' },
          access: systemOnly,
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'welcomeSentAt',
          type: 'date',
          label: { en: 'Welcome email sent', zh: '欢迎信发送时间' },
          access: systemOnly,
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'lastSentAt',
          type: 'date',
          label: { en: 'Last daily email', zh: '最近一封' },
          access: systemOnly,
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
  ],
}
