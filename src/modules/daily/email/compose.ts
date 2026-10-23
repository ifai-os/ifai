import { createTranslator } from 'next-intl'

import { messagesFileName, type Locale } from '@/i18n/config'
import { siteUrl } from '@/lib/site-url'

import type { StoryCategory } from '../categories'
import { dailyEmailFrom } from './delivery'
import type { EmailFooter } from './layout'
import type { SubscriptionLinks } from './links'

/** What the welcome and the morning email share: their texts, the footer and the logo. */

async function messagesOf(locale: Locale) {
  return (await import(`../../../../messages/${messagesFileName(locale)}.json`)).default
}

export type EmailMessages = Awaited<ReturnType<typeof emailTranslator>>

/** The email texts in the subscriber's language (messages/*.json, `dailyEmail`). */
export async function emailTranslator(locale: Locale) {
  return createTranslator({ locale, messages: await messagesOf(locale), namespace: 'dailyEmail' })
}

/** The story categories' names in the language, as the daily list shows them. */
export async function categoryNames(locale: Locale): Promise<(category: StoryCategory) => string> {
  const t = createTranslator({ locale, messages: await messagesOf(locale), namespace: 'categories' })
  return (category) => t(category)
}

/** The footer every daily email carries. */
export function emailFooter(t: EmailMessages, links: SubscriptionLinks): EmailFooter {
  return {
    why: t('footer.why'),
    manage: { label: t('footer.manage'), href: links.manage },
    unsubscribe: { label: t('footer.unsubscribe'), href: links.unsubscribe },
    site: { name: 'IFAI', href: links.site },
    sender: dailyEmailFrom(),
  }
}

/** The IFAI tile as a PNG on the site itself. */
export const emailLogo = () => `${siteUrl()}/icon-192.png`
