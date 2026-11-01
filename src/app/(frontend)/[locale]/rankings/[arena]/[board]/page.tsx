import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLaunched } from '@/config/site'
import { isLocale } from '@/i18n/config'
import { redirect } from '@/i18n/navigation'
import { ExternalBoardView } from '@/modules/rankings/components/external-board'
import { boardsOf, externalHref, findBoard, isExternalSource, readExternalFilters } from '@/modules/rankings/external/sources'
import { externalMetadata } from '@/modules/rankings/metadata'

type Props = {
  params: Promise<{ locale: string; arena: string; board: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, arena: source, board: slug } = await params
  if (!isLocale(locale) || !isLaunched('rankings') || !isExternalSource(source)) return {}
  const board = findBoard(source, slug)
  return board ? externalMetadata({ locale, board, filters: readExternalFilters(await searchParams) }) : {}
}

/** One of an outside source's boards (/rankings/arena/webdev); the first lives at the source's own address. */
export default async function ExternalBoardPage({ params, searchParams }: Props) {
  const { locale, arena: source, board: slug } = await params
  if (!isLocale(locale) || !isLaunched('rankings') || !isExternalSource(source)) notFound()
  setRequestLocale(locale)
  const board = findBoard(source, slug)
  if (!board) notFound()
  const filters = readExternalFilters(await searchParams)
  if (board.slug === boardsOf(source)[0]?.slug) redirect({ href: externalHref(source, null, filters), locale })

  return <ExternalBoardView locale={locale} board={board} filters={filters} />
}
