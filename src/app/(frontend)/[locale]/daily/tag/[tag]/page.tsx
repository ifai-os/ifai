import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { DailyList } from '@/modules/daily/public/components/daily-list'
import { readPage, type SearchParams } from '@/modules/daily/public/list-params'
import { listMetadata } from '@/modules/daily/public/metadata'
import { isStoryTag } from '@/modules/daily/tags'

type Props = {
  params: Promise<{ locale: string; tag: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, tag } = await params
  const page = readPage(await searchParams)
  if (!isLocale(locale) || !isStoryTag(tag) || !page) return {}
  return listMetadata({ locale, category: null, tag, page })
}

export default async function DailyTagPage({ params, searchParams }: Props) {
  const { locale, tag } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const page = readPage(await searchParams)
  if (!isStoryTag(tag) || !page) notFound()

  return <DailyList locale={locale} tag={tag} page={page} />
}
