import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { JsonLd } from '@/lib/structured-data'
import { AppDetailView } from '@/modules/apps/components/app-detail'
import { getApp, getHomeApps } from '@/modules/apps/data'
import { appMetadata } from '@/modules/apps/metadata'
import { appJsonLd } from '@/modules/apps/structured-data'

type Props = { params: Promise<{ locale: string; slug: string }> }

// The hottest app in each language is rendered at build time, every other one on its first visit, then kept until
// an app changes. Next.js only prefetches a route it rendered at build, so with none the list's links to apps would
// wait on the server when clicked (docs/specs/apps.md「加载状态」).
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return []
  return (await getHomeApps(params.locale, 1)).trending.map((app) => ({ slug: app.slug }))
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
