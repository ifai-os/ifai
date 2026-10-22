import type { Access, PayloadRequest, TextField } from 'payload'
import { text } from 'payload/shared'

import { isValidSlug, slugify } from '../normalize'

export const appsAdminGroup = { en: 'Apps', zh: '应用' }

/** Back-office admins only. Site members (Better Auth) never act through Payload. */
export const isAdmin: Access = ({ req: { user } }) => Boolean(user)

/** Validation messages follow the admin UI language, which defaults to Chinese. */
export function adminMessage(req: PayloadRequest | undefined, message: { en: string; zh: string }): string {
  return req?.i18n?.language === 'en' ? message.en : message.zh
}

/** English slug shared by all five languages; filled from `from` when left empty. */
export function slugField({ from, reserved = [] }: { from: string; reserved?: readonly string[] }): TextField {
  return {
    name: 'slug',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    label: { en: 'Slug', zh: '网址名' },
    admin: {
      position: 'sidebar',
      description: {
        en: 'Lowercase English, shared by all five languages. Left empty, it is made from the name.',
        zh: '小写英文，五种语言共用。留空时按名称生成，名称里没有英文时要手动填。',
      },
    },
    hooks: {
      beforeValidate: [
        ({ value, siblingData }) =>
          typeof value === 'string' && value.trim()
            ? value.trim().toLowerCase()
            : slugify(String(siblingData?.[from] ?? '')),
      ],
    },
    validate: (value, args) => {
      const required = text(value, args)
      if (required !== true) return required
      if (typeof value !== 'string' || !isValidSlug(value)) {
        return adminMessage(args.req, {
          en: 'Use lowercase letters, digits and single hyphens, e.g. kimi-slides.',
          zh: '只能用小写字母、数字和单个连字符，例如 kimi-slides。',
        })
      }
      if (reserved.includes(value)) {
        return adminMessage(args.req, {
          en: `"${value}" is used by a site page. Pick another slug.`,
          zh: `「${value}」被站内页面占用了，换一个。`,
        })
      }
      return true
    },
  }
}
