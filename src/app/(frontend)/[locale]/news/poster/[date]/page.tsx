import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { isPosterDate } from '@/modules/daily/poster/rules'
import { PosterPageView } from '@/modules/daily/public/components/poster-page'
import { getPoster, posterNeighbours } from '@/modules/daily/public/data'
import { posterMetadata } from '@/modules/daily/public/metadata'

type Props = { params: Promise<{ locale: string; date: string }> }

// None at build time: a day's page is rendered on its first visit, then kept until the editor generates again.
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, date } = await params
  if (!isLocale(locale) || !isPosterDate(date)) return {}
  return posterMetadata(date, locale)
}

export default async function PosterPage({ params }: Props) {
  const { locale, date } = await params
  if (!isLocale(locale) || !isPosterDate(date)) notFound()
  setRequestLocale(locale)
  const [snapshot, neighbours] = await Promise.all([getPoster(date), posterNeighbours(date)])
  if (!snapshot) notFound()

  return <PosterPageView snapshot={snapshot} locale={locale} neighbours={neighbours} />
}
