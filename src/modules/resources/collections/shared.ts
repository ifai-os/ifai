import type { TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'

import { adminMessage } from '@/modules/apps/collections/shared'
import { isHttpUrl } from '@/modules/apps/normalize'

// Shared with the apps module for now; move to src/lib/payload when a third module needs them.
export { adminMessage, isAdmin, slugField } from '@/modules/apps/collections/shared'

export const resourcesAdminGroup = { en: 'Resources', zh: '资源' }

/** http(s) URL; `required` decides whether empty is allowed. */
export function urlValidation(required: boolean): TextFieldSingleValidation {
  return (value, args) => {
    if (required) {
      const present = text(value, args)
      if (present !== true) return present
    } else if (!value) {
      return true
    }
    return typeof value === 'string' && isHttpUrl(value)
      ? true
      : adminMessage(args.req, {
          en: 'Enter a full address starting with https://',
          zh: '填完整的网址，以 https:// 开头。',
        })
  }
}
