import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { DailyList } from '@/modules/daily/public/components/daily-list'
import { readPage, type SearchParams } from '@/modules/daily/public/list-params'
import { listMetadata } from '@/modules/daily/public/metadata'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const page = readPage(await searchParams)
  if (!isLocale(locale) || !page) return {}
  return listMetadata({ locale, category: null, page })
}

export default async function DailyPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const page = readPage(await searchParams)
  if (!page) notFound()

  return <DailyList locale={locale} page={page} />
}
