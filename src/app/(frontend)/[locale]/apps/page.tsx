import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { AppsDirectory } from '@/modules/apps/components/apps-directory'
import { readListParams, type SearchParams } from '@/modules/apps/list-params'
import { listMetadata } from '@/modules/apps/metadata'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const { q, page, board } = readListParams(await searchParams)
  if (!isLocale(locale) || !page) return {}
  return listMetadata({ locale, category: null, q, page, board })
}

export default async function AppsPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const { q, page, board, sort } = readListParams(await searchParams)
  if (!page) notFound()

  return <AppsDirectory locale={locale} category={null} q={q} page={page} board={board} sort={sort} />
}
