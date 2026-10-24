import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ListNavigationProvider } from '@/components/states/list-navigation'
import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { alternatesFor } from '@/lib/seo'
import { readPage, type SearchParams } from '@/modules/daily/public/list-params'
import { followingPath, FollowingPageView } from '@/modules/follows/components/following-page'
import { getFollowingPage } from '@/modules/follows/following'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'follows' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor(followingPath, locale),
    robots: { index: false },
  }
}

// Each member's own list, so rendered on every request.
export default async function FollowingPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const page = readPage(await searchParams)
  if (!page) notFound()
  const session = await auth.api.getSession({ headers: await headers() })
  const following = session ? await getFollowingPage(session.user.id, page, locale) : null
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (following && page > 1 && following.stories.stories.length === 0) notFound()

  return (
    <ListNavigationProvider>
      <FollowingPageView following={following} signIn={authProviders()} serverToday={dayKey(new Date(), serverTimeZone)} />
    </ListNavigationProvider>
  )
}
