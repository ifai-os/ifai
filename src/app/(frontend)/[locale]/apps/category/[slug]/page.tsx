import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { AppsDirectory } from '@/modules/apps/components/apps-directory'
import { getCategory } from '@/modules/apps/data'
import { readListParams, type SearchParams } from '@/modules/apps/list-params'
import { listMetadata } from '@/modules/apps/metadata'

type Props = {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const { q, page } = readListParams(await searchParams)
  if (!isLocale(locale) || !page) return {}
  const category = await getCategory(slug, locale)
  if (!category) return {}
  return listMetadata({ locale, category, q, page })
}

export default async function AppCategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const { q, page } = readListParams(await searchParams)
  const category = await getCategory(slug, locale)
  if (!page || !category) notFound()

  return <AppsDirectory locale={locale} category={category} q={q} page={page} />
}
