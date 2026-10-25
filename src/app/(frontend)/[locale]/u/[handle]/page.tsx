import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { permanentRedirect } from '@/i18n/navigation'
import { authProviders } from '@/lib/auth/providers'
import { JsonLd } from '@/lib/structured-data'
import { circlesLaunched, getCircles } from '@/modules/circles/public'
import { ProfilePage } from '@/modules/profiles/components/profile-page'
import { profileMetadata } from '@/modules/profiles/metadata'
import { getProfilePage, resolveHandle } from '@/modules/profiles/public'
import { parseBefore, parseProfileTab, profilePath } from '@/modules/profiles/rules'
import { profileJsonLd } from '@/modules/profiles/structured-data'

type Props = {
  params: Promise<{ locale: string; handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined)

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, handle } = await params
  if (!isLocale(locale) || !circlesLaunched()) return {}
  const query = await searchParams
  return profileMetadata(handle, locale, { tab: one(query.tab), before: one(query.before) })
}

// Rendered on every request: whether it is the reader's own page and whom they follow are in it.
export default async function MemberPage({ params, searchParams }: Props) {
  const { locale, handle } = await params
  if (!isLocale(locale) || !circlesLaunched()) notFound()
  setRequestLocale(locale)
  const query = await searchParams
  const found = await resolveHandle(handle)
  if (found.status === 'missing') notFound()
  // An address they had before, or in capitals: on to the one they have now, with the tab.
  if (found.status === 'moved') {
    const tab = one(query.tab)
    return permanentRedirect({ href: { pathname: profilePath(found.handle), query: tab ? { tab } : {} }, locale })
  }
  const page = await getProfilePage(found.userId, locale, parseProfileTab(one(query.tab)), parseBefore(one(query.before)))
  if (!page) notFound()
  const t = await getTranslations('circles')

  return (
    <>
      <JsonLd data={profileJsonLd(page, { anonymous: t('anonymous') })} />
      <ProfilePage page={page} circles={await getCircles(locale)} signIn={authProviders()} />
    </>
  )
}
