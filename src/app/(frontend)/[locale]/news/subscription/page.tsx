import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { SubscriptionPage } from '@/modules/daily/email/components/subscription-page'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string | string[]; unsubscribe?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'subscription' })
  // One reader's page: never indexed, and the token in its address never goes out as a Referer.
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' }
}

export default async function DailySubscriptionPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const { token, unsubscribe } = await searchParams
  return <SubscriptionPage locale={locale} token={typeof token === 'string' ? token : ''} unsubscribe={unsubscribe === '1'} />
}
