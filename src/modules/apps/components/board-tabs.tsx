import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { boards, type Board } from '../boards'
import { listHref } from '../list-params'

type BoardTabsProps = {
  current: Board
  /** The category and search carry over to the board picked. */
  category: string | null
  q: string
  className?: string
}

/**
 * 综合 / 飙升 / 新上架. Links (`?board=`) rather than buttons, so every board can be shared and
 * crawled; picking one goes back to that board's own order.
 */
export function BoardTabs({ current, category, q, className = '' }: BoardTabsProps) {
  const t = useTranslations('apps')

  return (
    <nav aria-label={t('boardsLabel')} className={className}>
      <ul className="grid grid-cols-3 gap-0.5 rounded-tile bg-surface-2 p-0.75 md:flex md:rounded-pill md:border md:border-surface-2 md:bg-surface">
        {boards.map((board) => {
          const active = board === current
          return (
            <li key={board}>
              <Link
                href={listHref({ category, q, board })}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 items-center justify-center rounded-thumb px-4 text-ui whitespace-nowrap transition-colors md:rounded-pill md:text-meta md:font-medium ${
                  active ? 'bg-bg font-medium text-ink shadow-divider' : 'text-ink-4 hover:text-ink'
                }`}
              >
                {t(`boards.${board}`)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
