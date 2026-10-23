import { localizePath, type Locale } from '@/i18n/config'
import { siteUrl } from '@/lib/site-url'

import { subscriberIdOf, subscriberToken } from './token'

const secret = () => process.env.PAYLOAD_SECRET ?? ''

export function tokenFor(subscriberId: number): string {
  return subscriberToken(subscriberId, secret())
}

export function subscriberIdFromToken(token: unknown): number | null {
  return subscriberIdOf(token, secret())
}

/** The manage page, under the language's prefix: /zh-hans/daily/subscription. */
export function managePath(locale: Locale): string {
  return localizePath(locale, '/daily/subscription')
}

export type SubscriptionLinks = {
  /** Change language and time zone, unsubscribe, subscribe again. */
  manage: string
  /** The manage page, unsubscribing as it opens:「退订」in the footer,「一键退订」in the welcome email. */
  unsubscribe: string
  /** For mail clients' own unsubscribe button (List-Unsubscribe, RFC 8058). */
  oneClick: string
  /** The site's home page in the subscriber's language. */
  site: string
}

/** Every link an email to this subscriber carries, each signed for them. */
export function subscriptionLinks(subscriberId: number, locale: Locale): SubscriptionLinks {
  const query = `token=${encodeURIComponent(tokenFor(subscriberId))}`
  const origin = siteUrl()
  return {
    manage: `${origin}${managePath(locale)}?${query}`,
    unsubscribe: `${origin}${managePath(locale)}?${query}&unsubscribe=1`,
    oneClick: `${origin}/api/subscriptions/unsubscribe?${query}`,
    site: `${origin}${localizePath(locale, '/')}`,
  }
}

/**
 * The same links for an email that goes to no subscriber (the back office's preview and test
 * email): the manage page without a token, which says the link is not valid and offers the box.
 */
export function previewLinks(locale: Locale): SubscriptionLinks {
  const origin = siteUrl()
  const manage = `${origin}${managePath(locale)}`
  return { manage, unsubscribe: manage, oneClick: manage, site: `${origin}${localizePath(locale, '/')}` }
}

/** Headers that give mail clients a one-click「退订」button (Gmail and Yahoo require them for bulk mail). */
export function unsubscribeHeaders(links: SubscriptionLinks): Record<string, string> {
  return {
    'List-Unsubscribe': `<${links.oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
