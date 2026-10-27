import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { DailyList } from '@/modules/daily/public/components/daily-list'
import { readCategory, readPage, type SearchParams } from '@/modules/daily/public/list-params'
import { listMetadata } from '@/modules/daily/public/metadata'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const query = await searchParams
  const page = readPage(query)
  const category = readCategory(query)
  if (!isLocale(locale) || !page || category === undefined) return {}
  // The list filtered to a category points search engines at the category's own page.
  if (category) return { ...(await listMetadata({ locale, category, page })), robots: { index: false, follow: true } }
  return listMetadata({ locale, category: null, page })
}

export default async function DailyPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const query = await searchParams
  const page = readPage(query)
  const category = readCategory(query)
  if (!page || category === undefined) notFound()

  return <DailyList locale={locale} category={category} page={page} />
}
