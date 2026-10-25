import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { listPageExists, RecommendList } from '@/modules/recommend/components/recommend-list'
import { listMetadata } from '@/modules/recommend/metadata'
import { readListQuery, recommendLaunched, type SearchParams } from '@/modules/recommend/rules'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const query = readListQuery(await searchParams)
  if (!isLocale(locale) || !query || !recommendLaunched()) return {}
  return listMetadata(locale, query)
}

export default async function RecommendPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !recommendLaunched()) notFound()
  setRequestLocale(locale)
  const query = readListQuery(await searchParams)
  if (!query || !(await listPageExists(query))) notFound()

  return <RecommendList query={query} />
}
