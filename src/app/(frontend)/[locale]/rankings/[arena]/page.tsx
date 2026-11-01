import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { redirect } from '@/i18n/navigation'
import { ExternalBoardView } from '@/modules/rankings/components/external-board'
import { RankingsBoard } from '@/modules/rankings/components/rankings-board'
import { getArenas } from '@/modules/rankings/data'
import { boardsOf, isExternalSource, readExternalFilters } from '@/modules/rankings/external/sources'
import { boardMetadata, externalMetadata } from '@/modules/rankings/metadata'
import { boardHref, rankingsLaunched, readBoardFilters } from '@/modules/rankings/rules'

type Props = {
  params: Promise<{ locale: string; arena: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, arena: slug } = await params
  if (!isLocale(locale) || !rankingsLaunched()) return {}
  if (isExternalSource(slug)) {
    const [board] = boardsOf(slug)
    return board ? externalMetadata({ locale, board, filters: readExternalFilters(await searchParams) }) : {}
  }
  const arenas = await getArenas(locale)
  const arena = arenas.find((item) => item.slug === slug)
  if (!arena) return {}
  return boardMetadata({ locale, arena, first: arena === arenas[0], filters: readBoardFilters(await searchParams) })
}

/**
 * Another arena's rankings (the first arena's own address is /rankings), or an outside source's
 * first board (/rankings/arena).
 */
export default async function ArenaRankingsPage({ params, searchParams }: Props) {
  const { locale, arena: slug } = await params
  if (!isLocale(locale) || !rankingsLaunched()) notFound()
  setRequestLocale(locale)
  if (isExternalSource(slug)) {
    const [board] = boardsOf(slug)
    if (!board) notFound()
    return <ExternalBoardView locale={locale} board={board} filters={readExternalFilters(await searchParams)} />
  }
  const arenas = await getArenas(locale)
  const arena = arenas.find((item) => item.slug === slug)
  if (!arena) notFound()
  const filters = readBoardFilters(await searchParams)
  if (arena === arenas[0]) redirect({ href: boardHref(null, filters), locale })

  return <RankingsBoard locale={locale} arena={arena} arenas={arenas} filters={filters} />
}
