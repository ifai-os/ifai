import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ListNavigationProvider } from '@/components/states/list-navigation'
import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { JsonLd } from '@/lib/structured-data'
import { TopicPageView } from '@/modules/daily/public/components/topic-page'
import { getTopicPage } from '@/modules/daily/public/data'
import { readPage, readTopicKey, topicHref, type SearchParams } from '@/modules/daily/public/list-params'
import { topicMetadata } from '@/modules/daily/public/metadata'
import { storyListJsonLd } from '@/modules/daily/public/structured-data'

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
  const t = await getTranslations()

  return (
    <ListNavigationProvider>
      <JsonLd
        data={storyListJsonLd(
          locale,
          { name: topic.name, path: topicHref(topicKey, page), stories: topic.stories, about: { kind: topic.kind, name: topic.name } },
          { home: t('metadata.title'), daily: t('nav.daily') },
        )}
      />
      <TopicPageView topic={topic} serverToday={dayKey(new Date(), serverTimeZone)} signIn={authProviders()} />
    </ListNavigationProvider>
  )
}
