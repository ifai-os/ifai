import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { messagesFileName } from './config'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    // Server-rendered dates use UTC until users can pick a time zone.
    timeZone: 'UTC',
    messages: (await import(`../../messages/${messagesFileName(locale)}.json`)).default,
  }
})
