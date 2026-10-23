import { useTranslations } from 'next-intl'

import { ButtonLink } from '@/components/button'

import type { Board, Sort } from '../boards'
import { listHref } from '../list-params'

type PaginationProps = {
  category: string | null
  q: string
  board: Board
  sort: Sort
  page: number
  pages: number
}

/** Previous / next under the list; plain links, so every page can be crawled and shared. */
export function Pagination({ category, q, board, sort, page, pages }: PaginationProps) {
  const t = useTranslations('apps')
  if (pages <= 1) return null

  return (
    <nav aria-label={t('pages')} className="flex items-center justify-between gap-3 pt-3">
      {page > 1 ? (
        <ButtonLink href={listHref({ category, q, board, sort, page: page - 1 })} variant="secondary">
          ‹ {t('previous')}
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className="text-meta text-ink-4 tabular-nums">{t('pageOf', { page, pages })}</span>
      {page < pages ? (
        <ButtonLink href={listHref({ category, q, board, sort, page: page + 1 })} variant="secondary">
          {t('next')} ›
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  )
}
