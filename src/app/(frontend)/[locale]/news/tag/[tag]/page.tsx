import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ListNavigationProvider } from '@/components/states/list-navigation'
import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { JsonLd } from '@/lib/structured-data'
import { TagPageView } from '@/modules/daily/public/components/tag-page'
import { getTagPage } from '@/modules/daily/public/data'
import { listHref, readPage, type SearchParams } from '@/modules/daily/public/list-params'
import { listMetadata } from '@/modules/daily/public/metadata'
import { storyListJsonLd } from '@/modules/daily/public/structured-data'
import { isStoryTag } from '@/modules/daily/tags'

type Props = {
  params: Promise<{ locale: string; tag: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, tag } = await params
  const page = readPage(await searchParams)
  if (!isLocale(locale) || !isStoryTag(tag) || !page) return {}
  return listMetadata({ locale, category: null, tag, page })
}

export default async function DailyTagPage({ params, searchParams }: Props) {
  const { locale, tag } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const page = readPage(await searchParams)
  if (!isStoryTag(tag) || !page) notFound()
  const tagPage = await getTagPage(tag, page, locale)
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (!tagPage) notFound()
  const t = await getTranslations()

  return (
    <ListNavigationProvider>
      <JsonLd
        data={storyListJsonLd(
          locale,
          { name: t(`tags.${tag}`), path: listHref({ category: null, tag, page }), stories: tagPage.stories },
          { home: t('metadata.title'), daily: t('nav.daily') },
        )}
      />
      <TagPageView page={tagPage} serverToday={dayKey(new Date(), serverTimeZone)} signIn={authProviders()} />
    </ListNavigationProvider>
  )
}
