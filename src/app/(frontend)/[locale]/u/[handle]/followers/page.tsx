import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { permanentRedirect } from '@/i18n/navigation'
import { authProviders } from '@/lib/auth/providers'
import { circlesLaunched, getCircles } from '@/modules/circles/public'
import { PeopleList } from '@/modules/profiles/components/people-list'
import { peopleMetadata } from '@/modules/profiles/metadata'
import { getPeoplePage, resolveHandle } from '@/modules/profiles/public'
import { parseBefore, peoplePath } from '@/modules/profiles/rules'

type Props = {
  params: Promise<{ locale: string; handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const side = 'followers'

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined)

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, handle } = await params
  if (!isLocale(locale) || !circlesLaunched()) return {}
  return peopleMetadata(handle, locale, side, one((await searchParams).before))
}

// Rendered on every request: whom the reader follows is in it.
export default async function FollowersPage({ params, searchParams }: Props) {
  const { locale, handle } = await params
  if (!isLocale(locale) || !circlesLaunched()) notFound()
  setRequestLocale(locale)
  const found = await resolveHandle(handle)
  if (found.status === 'missing') notFound()
  // An address they had before, or in capitals: on to the one they have now.
  if (found.status === 'moved') return permanentRedirect({ href: peoplePath(found.handle, side), locale })
  const page = await getPeoplePage(found.userId, side, parseBefore(one((await searchParams).before)))
  if (!page) notFound()
  const t = await getTranslations()
  const name = page.profile.name || t('circles.anonymous')

  return (
    <PeopleList
      page={page}
      side={side}
      title={t('profiles.followersTitle', { name })}
      circles={await getCircles(locale)}
      signIn={authProviders()}
    />
  )
}
