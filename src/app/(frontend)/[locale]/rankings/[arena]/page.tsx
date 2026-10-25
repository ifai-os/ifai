import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { redirect } from '@/i18n/navigation'
import { RankingsBoard } from '@/modules/rankings/components/rankings-board'
import { getArenas } from '@/modules/rankings/data'
import { boardMetadata } from '@/modules/rankings/metadata'
import { boardHref, rankingsLaunched, readBoardFilters } from '@/modules/rankings/rules'

type Props = {
  params: Promise<{ locale: string; arena: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, arena: slug } = await params
  if (!isLocale(locale) || !rankingsLaunched()) return {}
  const arenas = await getArenas(locale)
  const arena = arenas.find((item) => item.slug === slug)
  if (!arena) return {}
  return boardMetadata({ locale, arena, first: arena === arenas[0], filters: readBoardFilters(await searchParams) })
}

/** Another arena's rankings; the first arena's own address is /rankings. */
export default async function ArenaRankingsPage({ params, searchParams }: Props) {
  const { locale, arena: slug } = await params
  if (!isLocale(locale) || !rankingsLaunched()) notFound()
  setRequestLocale(locale)
  const arenas = await getArenas(locale)
  const arena = arenas.find((item) => item.slug === slug)
  if (!arena) notFound()
  const filters = readBoardFilters(await searchParams)
  if (arena === arenas[0]) redirect({ href: boardHref(null, filters), locale })

  return <RankingsBoard locale={locale} arena={arena} arenas={arenas} filters={filters} />
}
