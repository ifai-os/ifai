import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'

import { subscribingOpen } from '../delivery'
import { subscriberForToken } from '../manage'
import { languageOptions, subscriptionView, zoneOptions } from '../view'
import { SubscribeBox } from './subscribe-box'
import { SubscriptionManager } from './subscription-manager'

type SubscriptionPageProps = {
  locale: Locale
  token: string
  /** Opened from「退订」in an email. */
  unsubscribe: boolean
}

/** /[locale]/daily/subscription?token=…: one reader's subscription, or「链接已失效」and a fresh box. */
export async function SubscriptionPage({ locale, token, unsubscribe }: SubscriptionPageProps) {
  const t = await getTranslations('subscription')
  const subscriber = token ? await subscriberForToken(token) : null
  const now = new Date()

  return (
    <main id="main" className="mx-auto flex w-full max-w-read flex-col gap-6 px-4 pt-10 pb-24 md:pt-16">
      {subscriber ? (
        <>
          <h1 className="text-h2">{t('title')}</h1>
          <SubscriptionManager
            token={token}
            initial={subscriptionView(subscriber, locale, now, subscribingOpen())}
            unsubscribeOnOpen={unsubscribe}
            zones={zoneOptions(subscriber.timeZone, now)}
            languages={languageOptions}
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-h2">{t('invalidTitle')}</h1>
            <p className="text-body text-ink-3">{t('invalidBody')}</p>
          </div>
          {subscribingOpen() && <SubscribeBox variant="card" />}
        </>
      )}
    </main>
  )
}
