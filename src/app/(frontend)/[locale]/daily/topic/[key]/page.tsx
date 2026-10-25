import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { ListNavigationProvider } from '@/components/states/list-navigation'
import { isLocale } from '@/i18n/config'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { TopicPageView } from '@/modules/daily/public/components/topic-page'
import { getTopicPage } from '@/modules/daily/public/data'
import { readPage, readTopicKey, type SearchParams } from '@/modules/daily/public/list-params'
import { topicMetadata } from '@/modules/daily/public/metadata'

type Props = {
  params: Promise<{ locale: string; key: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, key } = await params
  const topicKey = readTopicKey(key)
  const page = readPage(await searchParams)
  if (!isLocale(locale) || !topicKey || !page) return {}
  return topicMetadata(topicKey, page, locale)
}

export default async function DailyTopicPage({ params, searchParams }: Props) {
  const { locale, key } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const topicKey = readTopicKey(key)
  const page = readPage(await searchParams)
  if (!topicKey || !page) notFound()
  const topic = await getTopicPage(topicKey, page, locale)
  if (!topic) notFound()

  return (
    <ListNavigationProvider>
      <TopicPageView topic={topic} serverToday={dayKey(new Date(), serverTimeZone)} />
    </ListNavigationProvider>
  )
}
