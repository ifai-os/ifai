import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { DailyList } from '@/modules/daily/public/components/daily-list'
import { isStoryCategory } from '@/modules/daily/public/data'
import { readPage, type SearchParams } from '@/modules/daily/public/list-params'
import { listMetadata } from '@/modules/daily/public/metadata'

type Props = {
  params: Promise<{ locale: string; category: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, category } = await params
  const page = readPage(await searchParams)
  if (!isLocale(locale) || !isStoryCategory(category) || !page) return {}
  return listMetadata({ locale, category, page })
}

export default async function DailyCategoryPage({ params, searchParams }: Props) {
  const { locale, category } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const page = readPage(await searchParams)
  if (!isStoryCategory(category) || !page) notFound()

  return <DailyList locale={locale} category={category} page={page} />
}
