import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'
import { dateOfKey } from '@/lib/local-time'

import { getExternalBoard, getExternalBoards } from '../external/data'
import { AA_SITE_URL, ARENA_DATASET_URL, ARENA_SITE_URL, CC_BY_URL, externalHref, type BoardRef, type ExternalFilters } from '../external/sources'
import { TOP_SHOWN } from '../rules'
import { ExternalTable } from './external-table'
import { Makers } from './makers'
import { PillTabs } from './pill-tabs'
import { ScoreTrend } from './score-trend'
import { SourceTabs } from './source-tabs'
import { TopTen } from './top-ten'

type ExternalBoardViewProps = {
  locale: Locale
  board: BoardRef
  filters: ExternalFilters
}

const outbound = 'text-link hover:underline'

/** Each source's words (`rankingsExternal.<copy>`) and its own site. */
const sourceCopy = {
  arena: { copy: 'arena', site: ARENA_SITE_URL },
  'artificial-analysis': { copy: 'artificialAnalysis', site: AA_SITE_URL },
} as const

function Outbound({ href, rel = 'noopener noreferrer', children }: { href: string; rel?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel={rel} className={outbound}>
      {children}
    </a>
  )
}

/**
 * An outside source's board (docs/specs/rankings.md「外部榜单」): 「数据来源」, a heading saying
 * whose leaderboard it is, the source's boards, then from its newest day「前 10」,「完整榜单」,
 * 「分数走势」(one point a month, when the source gives licenses) and「按厂商」, and the attribution
 * the source asks for. Scores and places are the source's own, never mixed with the blind test.
 */
export async function ExternalBoardView({ locale, board, filters }: ExternalBoardViewProps) {
  const t = await getTranslations('rankingsExternal')
  const format = await getFormatter()
  const [data, boards] = await Promise.all([getExternalBoard(board.source, board.slug), getExternalBoards()])
  const { copy, site } = sourceCopy[board.source]
  const boardName = t(`boards.${board.label}`)
  const day = (key: string) => format.dateTime(dateOfKey(key), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const top = data.rows.slice(0, TOP_SHOWN).map((row, index) => ({ modelId: index, name: row.model, org: row.maker, rank: row.rank, score: row.score }))
  const tabs = boards[board.source].map((item) => ({ key: item.slug, name: t(`boards.${item.label}`), href: externalHref(item.source, item.slug) }))
  // The trend follows the best closed and open-weights models: only for a source that says which is which.
  const trend = data.trend.filter((point) => point.open !== null || point.closed !== null)

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-8 px-4 pt-5 pb-16 md:pt-8 md:pb-24">
      <div className="flex flex-col gap-4">
        <SourceTabs locale={locale} current={board.source} />
        <section className="flex flex-col justify-between gap-6 rounded-hero border border-surface-2 bg-surface p-6 md:p-8">
          <div className="flex flex-col gap-2.5">
            <p className="text-small tracking-[0.04em] text-ink-4">{t(`${copy}.eyebrow`)}</p>
            <h1 className="text-h1 md:text-display">{t(`${copy}.headline`)}</h1>
            <p className="max-w-150 text-body text-ink-2">{t(`${copy}.intro`)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
            {data.publishedOn && (
              <p className="flex items-baseline gap-2">
                <span aria-hidden="true" className="size-2 self-center rounded-pill bg-up" />
                <span className="text-h2 tabular-nums">{format.number(data.days)}</span>
                <span className="text-meta text-ink-4">{t('days', { count: data.days, since: data.since ? day(data.since) : '' })}</span>
              </p>
            )}
            <a href={site} target="_blank" rel="noopener noreferrer" className="text-meta font-medium text-link hover:underline">
              {t(`${copy}.visit`)}
            </a>
          </div>
        </section>
      </div>

      <section aria-label={boardName} className="flex flex-col gap-4">
        <PillTabs label={t('boardsLabel')} items={tabs} current={board.slug} />
        {data.publishedOn && (
          <p className="text-meta text-ink-4">
            {t.rich(board.source === 'arena' ? 'published' : 'updated', {
              date: () => <time dateTime={data.publishedOn as string}>{day(data.publishedOn as string)}</time>,
            })}
            {' · '}
            {t('models', { count: data.rows.length })}
          </p>
        )}
        {data.rows.length > 0 ? (
          <TopTen arenaName={boardName} rows={top} digits={board.digits} />
        ) : (
          <EmptyState icon="rankings" title={t('emptyTitle')} body={t('emptyBody')} />
        )}
      </section>

      {data.rows.length > 0 && <ExternalTable board={board} rows={data.rows} filters={filters} />}

      {data.rows.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {trend.length >= 2 && <ScoreTrend points={trend.map((point) => ({ week: point.day, open: point.open, closed: point.closed }))} monthly />}
          <Makers rows={data.rows.map((row) => ({ rank: row.rank, org: row.maker }))} />
        </div>
      )}

      <p className="text-small text-ink-4">
        {board.source === 'arena'
          ? t.rich('arena.attribution', {
              arena: (chunks) => <Outbound href={ARENA_SITE_URL}>{chunks}</Outbound>,
              dataset: (chunks) => <Outbound href={ARENA_DATASET_URL}>{chunks}</Outbound>,
              license: (chunks) => (
                <Outbound href={CC_BY_URL} rel="noopener noreferrer license">
                  {chunks}
                </Outbound>
              ),
            })
          : t.rich('artificialAnalysis.attribution', { aa: (chunks) => <Outbound href={AA_SITE_URL}>{chunks}</Outbound> })}
      </p>
    </main>
  )
}
