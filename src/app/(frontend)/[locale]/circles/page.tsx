import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { authProviders } from '@/lib/auth/providers'
import { alternatesFor } from '@/lib/seo'
import { CirclesView } from '@/modules/circles/components/circles-view'
import { circlesLaunched, getCircles, getOverview } from '@/modules/circles/public'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !circlesLaunched()) return {}
  const t = await getTranslations({ locale, namespace: 'circles' })
  const query = await searchParams
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor('/circles', locale),
    // One circle or another tab is the same page filtered: followed, not indexed (docs/specs/circles.md「页面与路由」).
    ...((query.circle !== undefined || query.tab !== undefined) && { robots: { index: false, follow: true } }),
  }
}

export default async function CirclesPage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !circlesLaunched()) notFound()
  setRequestLocale(locale)
  // Rendered per request, not ahead: the address picks the circle and the tab, which the page
  // reads (useSearchParams) and the metadata marks noindex. The circles and their numbers are cached.
  await connection()
  const circles = await getCircles(locale)
  const overview = await getOverview(circles.map((circle) => circle.id))

  return <CirclesView circles={circles} overview={overview} signIn={authProviders()} />
}
