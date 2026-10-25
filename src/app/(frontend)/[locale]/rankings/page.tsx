import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { RankingsBoard } from '@/modules/rankings/components/rankings-board'
import { getArenas } from '@/modules/rankings/data'
import { boardMetadata } from '@/modules/rankings/metadata'
import { rankingsLaunched, readBoardFilters } from '@/modules/rankings/rules'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !rankingsLaunched()) return {}
  const [arena] = await getArenas(locale)
  if (!arena) return {}
  return boardMetadata({ locale, arena, first: true, filters: readBoardFilters(await searchParams) })
}

/** 模型排行: the first published arena's rankings. */
export default async function RankingsPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !rankingsLaunched()) notFound()
  setRequestLocale(locale)
  const arenas = await getArenas(locale)
  if (!arenas[0]) notFound()

  return <RankingsBoard locale={locale} arena={arenas[0]} arenas={arenas} filters={readBoardFilters(await searchParams)} />
}
