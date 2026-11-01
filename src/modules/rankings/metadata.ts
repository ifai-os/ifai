import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { alternatesFor } from '@/lib/seo'

import type { PublicArena } from './data'
import { externalHref, type BoardRef, type ExternalFilters } from './external/sources'
import { boardHref, type BoardFilters } from './rules'

/**
 * An arena's rankings: the first arena's page is「模型排行」, the others carry their name.
 * Filtered tables stay out of search engines (docs/specs/rankings.md「页面与路由」).
 */
export async function boardMetadata({
  locale,
  arena,
  first,
  filters,
}: {
  locale: Locale
  arena: PublicArena
  first: boolean
  filters: BoardFilters
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'rankings' })
  const title = first ? t('metaTitle') : t('metaArenaTitle', { arena: arena.name })
  if (filters.weights || filters.region) return { title, robots: { index: false, follow: true } }
  return {
    title,
    description: t('description'),
    alternates: alternatesFor(boardHref(first ? null : arena.slug), locale),
  }
}

/** An outside source's board (「外部榜单」): titled with the source and the board; filtered tables stay out of search engines. */
export async function externalMetadata({ locale, board, filters }: { locale: Locale; board: BoardRef; filters: ExternalFilters }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'rankingsExternal' })
  const copy = board.source === 'arena' ? 'arena' : 'artificialAnalysis'
  const title = t(`${copy}.metaTitle`, { board: t(`boards.${board.label}`) })
  if (filters.weights) return { title, robots: { index: false, follow: true } }
  return { title, description: t(`${copy}.description`), alternates: alternatesFor(externalHref(board.source, board.slug), locale) }
}

/** The blind vote: one address for every question, kept out of search engines. */
export async function voteMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'rankingsVote' })
  return { title: t('metaTitle'), description: t('intro'), robots: { index: false, follow: true } }
}
