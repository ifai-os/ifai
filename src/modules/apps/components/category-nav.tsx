import { useTranslations } from 'next-intl'

import { ListLink } from '@/components/states/list-navigation'

import type { Board } from '../boards'
import type { CategoryItem } from '../data'
import { listHref } from '../list-params'

type CategoryNavProps = {
  categories: CategoryItem[]
  total: number
  /** Slug of the category being shown; null for all apps. */
  current: string | null
  /** A search in progress and the board carry over to the category picked. */
  q: string
  board: Board
}

/** Phones: a row of chips that scrolls sideways. Wider screens: a column with counts, beside the list. */
export function CategoryNav({ categories, total, current, q, board }: CategoryNavProps) {
  const t = useTranslations('apps')
  const items = [
    { slug: null, name: t('allCategories'), count: total },
    ...categories.map(({ slug, name, count }) => ({ slug, name, count })),
  ]

  return (
    <nav aria-label={t('filterLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col md:gap-0.5">
        {items.map((item) => {
          const active = item.slug === current
          return (
            <li key={item.slug ?? 'all'} className="flex-none">
              <ListLink
                href={listHref({ category: item.slug, q, board })}
                aria-current={active ? 'page' : undefined}
                className={`flex h-8.5 items-center gap-2.5 rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors md:h-10 md:rounded-none md:border-0 md:px-0 md:text-body md:font-medium ${
                  active
                    ? 'border-ink bg-ink text-bg md:bg-transparent md:text-ink'
                    : 'border-line bg-bg text-ink-2 hover:border-ink-4 md:text-ink-4 md:hover:text-ink'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`hidden size-1.5 flex-none rounded-pill md:block ${active ? 'bg-accent' : ''}`}
                />
                <span className="md:flex-1">{item.name}</span>
                <span className="hidden text-small font-normal text-ink-4 tabular-nums md:inline">{item.count}</span>
              </ListLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
