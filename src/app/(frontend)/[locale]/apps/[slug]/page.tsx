import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { JsonLd } from '@/lib/structured-data'
import { AppDetailView } from '@/modules/apps/components/app-detail'
import { getApp } from '@/modules/apps/data'
import { appMetadata } from '@/modules/apps/metadata'
import { appJsonLd } from '@/modules/apps/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// None at build time: each app's page is rendered on its first visit, then kept until an app changes.
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  return appMetadata(slug, locale)
}

export default async function AppPage({ params }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const app = await getApp(slug, locale)
  if (!app) notFound()
  const t = await getTranslations()

  return (
    <>
      <JsonLd data={appJsonLd(app, locale, { home: t('metadata.title'), apps: t('nav.apps') })} />
      <AppDetailView app={app} signIn={authProviders()} />
    </>
  )
}
