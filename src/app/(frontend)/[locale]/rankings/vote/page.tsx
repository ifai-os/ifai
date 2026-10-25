import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLaunched } from '@/config/site'
import { isLocale } from '@/i18n/config'
import { VotePage } from '@/modules/rankings/components/vote-page'
import { getArenas } from '@/modules/rankings/data'
import { voteMetadata } from '@/modules/rankings/metadata'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale) || !isLaunched('rankings')) return {}
  return voteMetadata(locale)
}

/** 盲测投票: `?arena=<slug>` picks the arena, the first one without. */
export default async function RankingsVotePage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isLocale(locale) || !isLaunched('rankings')) notFound()
  setRequestLocale(locale)
  const { arena: wanted } = await searchParams
  const arenas = await getArenas(locale)
  const arena = typeof wanted === 'string' && wanted ? arenas.find((item) => item.slug === wanted) : arenas[0]
  if (!arena) notFound()

  return <VotePage arena={arena} arenas={arenas} />
}
