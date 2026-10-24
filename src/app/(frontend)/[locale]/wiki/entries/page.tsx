import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { EntriesView } from '@/modules/wiki/components/entries-view'
import { listEntries } from '@/modules/wiki/data'
import { readEntriesParams, wikiLaunched, type SearchParams } from '@/modules/wiki/links'
import { entriesMetadata } from '@/modules/wiki/metadata'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  const { type, page } = readEntriesParams(await searchParams)
  if (!isLocale(locale) || !wikiLaunched() || !page) return {}
  return entriesMetadata(locale, { type, page })
}

export default async function WikiEntriesPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !wikiLaunched()) notFound()
  setRequestLocale(locale)
  const { type, page } = readEntriesParams(await searchParams)
  if (!page) notFound()
  const result = await listEntries({ locale, type, page })
  if (page > result.pages) notFound()

  return <EntriesView result={result} type={type} />
}
