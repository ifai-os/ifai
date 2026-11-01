import { getFormatter, getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'
import { dateOfKey } from '@/lib/local-time'
import { shanghaiDate } from '@/lib/shanghai-day'

import { getBoard, getCountedVotes, type PublicArena } from '../data'
import { boardHref, NEWCOMERS_SHOWN, TOP_SHOWN, voteHref, type BoardFilters } from '../rules'
import { ArenaTabs } from './arena-tabs'
import { BoardTable } from './board-table'
import { Makers } from './makers'
import { RankingsHero } from './rankings-hero'
import { ScoreTrend } from './score-trend'
import { SourceTabs } from './source-tabs'
import { TopTen } from './top-ten'
import { ValueForMoney } from './value-for-money'

type RankingsBoardProps = {
  locale: Locale
  arena: PublicArena
  /** Every published arena, the first one living at /rankings itself. */
  arenas: PublicArena[]
  filters: BoardFilters
}

/**
 * The rankings page of one arena (docs/specs/rankings.md「页面与路由」):「数据来源」, the heading with the
 * counted votes and「新上榜」, the arena tabs, then from the latest weekly snapshot「前 10」,
 *「性价比」,「完整榜单」with its filters,「分数走势」and「按厂商」. Before the first snapshot
 * the heading stays and the rest is an empty state pointing at the blind vote.
 */
export async function RankingsBoard({ locale, arena, arenas, filters }: RankingsBoardProps) {
  const t = await getTranslations('rankings')
  const format = await getFormatter()
  const [board, votes] = await Promise.all([getBoard(arena.id, locale), getCountedVotes(arena.id)])
  const slugOf = (item: PublicArena) => (item.slug === arenas[0]?.slug ? null : item.slug)
  const vote = voteHref(slugOf(arena))
  const placed = board.rows.filter((row) => row.rank !== null)
  // The snapshot's Shanghai date, like the Monday schedule and the trend's weeks: the same day for every reader.
  const updated =
    board.computedAt && format.dateTime(dateOfKey(shanghaiDate(new Date(board.computedAt))), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const priced = placed.flatMap((row) => (row.costUsd ? [{ modelId: row.modelId, name: row.name, costUsd: row.costUsd, score: row.score }] : []))

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 pt-5 pb-16 md:pt-8 md:pb-24">
      <div className="flex flex-col gap-4">
        <SourceTabs locale={locale} current="ifai" />
        <RankingsHero votes={votes} voteHref={vote} newcomers={board.newcomers.slice(0, NEWCOMERS_SHOWN)} />
      </div>

      <section aria-label={arena.name} className="flex flex-col gap-4">
        <ArenaTabs arenas={arenas} current={arena.slug} hrefOf={(item) => boardHref(slugOf(item))} />
        <p className="text-meta text-ink-4">
          {arena.intro}
          {arena.intro && updated && ' · '}
          {updated && t.rich('updated', { date: () => <time dateTime={board.computedAt as string}>{updated}</time> })}
        </p>
        {placed.length > 0 ? (
          <div className="flex flex-wrap items-stretch gap-4">
            <TopTen arenaName={arena.name} rows={placed.slice(0, TOP_SHOWN)} />
            {priced.length >= 3 && <ValueForMoney points={priced} />}
          </div>
        ) : (
          <EmptyState icon="rankings" title={t('emptyTitle')} body={t('emptyBody')}>
            <ButtonLink href={vote}>{t('voteCta')}</ButtonLink>
          </EmptyState>
        )}
      </section>

      {placed.length > 0 && <BoardTable arena={slugOf(arena)} rows={board.rows} filters={filters} />}

      {placed.length > 0 && (board.trend.length >= 2 || board.rows.length > 0) && (
        <div className="flex flex-wrap gap-4">
          {board.trend.length >= 2 && <ScoreTrend points={board.trend} />}
          <Makers rows={board.rows} />
        </div>
      )}
    </main>
  )
}
