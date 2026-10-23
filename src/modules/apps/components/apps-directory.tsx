import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ButtonLink } from '@/components/button'
import { LocalTime } from '@/components/local-time'
import { EmptyState } from '@/components/states/empty-state'
import type { Locale } from '@/i18n/config'

import { defaultSorts, type Board, type Sort } from '../boards'
import { getCategories, getNewcomers, listApps, type CategoryItem } from '../data'
import { listHref, submitHref } from '../list-params'
import { showTrancoRank } from '../settings'
import { BoardTabs } from './board-tabs'
import { CategoryNav } from './category-nav'
import { HowHeatCard, HowHeatToggle } from './how-heat'
import { Newcomers } from './newcomers'
import { Pagination } from './pagination'
import { Podium } from './podium'
import { RankingTable } from './ranking-table'
import { RevealRows } from './reveal-rows'
import { SearchForm } from './search-form'
import { SubmitCard } from './submit-card'
import { UpdatedBadge } from './updated-badge'

/** The first page shows this many rows, then「查看第 11–50 名」. */
const shownFirst = 10

type AppsDirectoryProps = {
  locale: Locale
  /** The category being shown; null for all apps. */
  category: CategoryItem | null
  q: string
  page: number
  board: Board
  sort: Sort
}

/**
 * The apps list (docs/specs/apps.md「页面与路由」): heading with when heat was updated, the
 * boards, the top three, search, categories, then one page of the board as a table, and「本周
 * 新上架」and「热度怎么算」beside it.
 */
export async function AppsDirectory({ locale, category, q, page, board, ...props }: AppsDirectoryProps) {
  const t = await getTranslations('apps')
  const showSiteRank = showTrancoRank()
  // The rank column (and its sort) only exist while ranks are shown.
  const sort = props.sort === 'site' && !showSiteRank ? defaultSorts[board] : props.sort
  const [{ total, categories }, result, newcomers] = await Promise.all([
    getCategories(locale),
    listApps({ locale, categoryId: category?.id ?? null, q, page, board, sort }),
    getNewcomers(locale),
  ])
  // Past the last page: answer 404 rather than an empty list under a new address.
  if (page > 1 && result.apps.length === 0) notFound()

  const slug = category?.slug ?? null
  const now = new Date()
  const { heatDay } = result
  const top3 = result.apps.slice(0, 3)
  const podium = board === 'top' && sort === 'heat' && page === 1 && !q && top3.length === 3 && top3.every((app) => app.heat)
  const collapse = page === 1 && !q && result.apps.length > shownFirst
  const updated = result.updatedAt
    ? t.rich('updated', { time: () => <LocalTime iso={result.updatedAt as string} /> })
    : t('updatedPending')

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-4 px-4 pt-5 pb-16 md:gap-7 md:pt-8 md:pb-24">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-center gap-5">
          {result.updatedAt && (
            <div className="hidden md:block">
              <UpdatedBadge iso={result.updatedAt} />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1 md:gap-1.5">
            <h1 className="text-h2 md:text-h1">{category ? category.name : t('title')}</h1>
            <p className="text-meta text-ink-4">
              {category ? t('count', { count: category.count }) : t('listed', { count: total })} · {updated}
            </p>
            <p className="hidden max-w-160 text-ui text-ink-3 md:block">{t('intro')}</p>
          </div>
        </div>
        <BoardTabs current={board} category={slug} q={q} className="hidden md:block" />
      </header>

      {podium && heatDay && <Podium apps={top3} heatDay={heatDay} showSiteRank={showSiteRank} />}

      <SearchForm locale={locale} category={slug} q={q} board={board} sort={sort} />
      <BoardTabs current={board} category={slug} q={q} className="md:hidden" />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-10">
        <div className="md:w-47.5 md:flex-none">
          <CategoryNav categories={categories} total={total} current={slug} q={q} board={board} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {result.apps.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                {q ? (
                  <p role="status" className="text-meta text-ink-4 wrap-anywhere">
                    {t('found', { count: result.total, q })}
                  </p>
                ) : (
                  <p className="text-meta text-ink-4 md:text-title md:text-ink">
                    {t('listTitle', {
                      board: t(`boards.${board}`),
                      category: category?.name ?? t('allCategories'),
                      count: result.total,
                    })}
                  </p>
                )}
                {result.apps.length > 1 && <span className="hidden text-meta text-ink-4 md:inline">{t('sortHint')}</span>}
              </div>
              <HowHeatToggle className="md:hidden" />
            </div>
          )}

          {result.apps.length > 0 ? (
            <RevealRows
              label={collapse ? t('showMore', { from: shownFirst + 1, to: result.apps.length }) : null}
            >
              <RankingTable
                apps={result.apps}
                board={board}
                sort={sort}
                category={slug}
                q={q}
                heatDay={heatDay}
                showSiteRank={showSiteRank}
                collapseAfter={collapse ? shownFirst : null}
                now={now}
              />
            </RevealRows>
          ) : q ? (
            <EmptyState icon="search" title={t('noMatchTitle', { q })} body={t('noMatchBody')}>
              {category ? (
                <ButtonLink href={listHref({ q, board })} variant="secondary">
                  {t('searchEverywhere')}
                </ButtonLink>
              ) : (
                <ButtonLink href={listHref({ board })} variant="secondary">
                  {t('clearSearch')}
                </ButtonLink>
              )}
              <ButtonLink href={submitHref(q)}>{t('submitApp')}</ButtonLink>
            </EmptyState>
          ) : board !== 'top' ? (
            <EmptyState
              title={board === 'rising' ? t('emptyRisingTitle') : t('emptyNewTitle')}
              body={board === 'rising' ? t('emptyRisingBody') : t('emptyNewBody')}
            >
              <ButtonLink href={listHref({ category: slug })} variant="secondary">
                {t('topList')}
              </ButtonLink>
            </EmptyState>
          ) : category ? (
            <EmptyState title={t('emptyCategoryTitle')} body={t('emptyCategoryBody')}>
              <ButtonLink href="/apps" variant="secondary">
                {t('allApps')}
              </ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
          )}

          <Pagination category={slug} q={q} board={board} sort={sort} page={page} pages={result.pages} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Newcomers apps={newcomers} now={now} />
        <HowHeatCard />
      </div>

      {/* A search with no match offers to submit the app already. */}
      {!(q && result.apps.length === 0) && <SubmitCard />}
    </main>
  )
}
