import { defineRouting } from 'next-intl/routing'

import { defaultLocale, localePrefixes, locales } from './config'

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Every page lives under a locale prefix; /zh-hans and /zh-hant map to zh-Hans / zh-Hant.
  localePrefix: { mode: 'always', prefixes: localePrefixes },
  // First visit follows Accept-Language; after a manual switch the choice is remembered for a year.
  localeCookie: { name: 'IFAI_LOCALE', maxAge: 60 * 60 * 24 * 365 },
})
