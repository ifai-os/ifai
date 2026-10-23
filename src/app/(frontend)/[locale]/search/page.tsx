import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { loadSearch, SearchPage } from '@/modules/search/components/search-page'
import { visibleKinds } from '@/modules/search/kinds'
import { readSearchParams, type SearchParams } from '@/modules/search/params'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

function readParams(params: SearchParams) {
  const read = readSearchParams(params)
  // A kind whose module has not launched yet is「全部」.
  const type = read.type === 'all' || visibleKinds().includes(read.type) ? read.type : 'all'
  return { ...read, type }
}

// Searches stay out of search engines (docs/specs/search.md) but their links are followed.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const { q } = readParams(await searchParams)
  const t = await getTranslations({ locale, namespace: 'search' })
  return { title: q ? t('queryTitle', { q }) : t('title'), robots: { index: false, follow: true } }
}

export default async function SiteSearchPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const { q, type, page } = readParams(await searchParams)
  if (!page) notFound()
  const loaded = await loadSearch({ locale, q, type, page })
  if (!loaded) notFound()

  return <SearchPage locale={locale} q={q} type={type} page={page} loaded={loaded} />
}
