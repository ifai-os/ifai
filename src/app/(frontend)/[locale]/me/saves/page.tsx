import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { auth } from '@/lib/auth/auth'
import { authProviders } from '@/lib/auth/providers'
import { alternatesFor } from '@/lib/seo'
import { getSavedApps } from '@/modules/apps/data'
import { SavedPage } from '@/modules/saves/components/saved-page'
import { savedIds } from '@/modules/saves/data'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'saves' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor('/me/saves', locale),
    robots: { index: false },
  }
}

// Each member's own list, so rendered on every request.
export default async function SavesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const session = await auth.api.getSession({ headers: await headers() })
  const apps = session ? await getSavedApps(await savedIds(session.user.id, 'app'), locale) : null

  return <SavedPage apps={apps} signIn={authProviders()} />
}
