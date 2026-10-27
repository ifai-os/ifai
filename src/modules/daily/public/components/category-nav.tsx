import { useTranslations } from 'next-intl'

import { ListLink } from '@/components/states/list-navigation'

import { storyCategories, type StoryCategory } from '../../categories'
import { filterHref, listHref } from '../list-params'

type CategoryNavProps = {
  current: StoryCategory | null
  /** The category pages' larger pills (「IFAI 日报 · 分类页」board), which wrap on wide screens. */
  large?: boolean
  /** The daily list's column: filter the list in place instead of opening the category's page. */
  filter?: boolean
}

/**
 * All stories plus the seven categories. The daily list (「IFAI 日报（新版）」): a column beside the
 * stories, a red dot by the current one; on phones a row of chips that scrolls sideways
 * (「手机 · 日报」). The category pages have pills instead.
 */
export function CategoryNav({ current, large = false, filter = false }: CategoryNavProps) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const items: { key: StoryCategory | null; name: string }[] = [
    { key: null, name: t('allCategories') },
    ...storyCategories.map((key) => ({ key, name: names(key) })),
  ]

  return (
    <nav aria-label={t('filterLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className={`flex ${large ? 'gap-2.5 md:flex-wrap' : 'gap-2 md:flex-col'}`}>
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key ?? 'all'} className="flex-none">
              <ListLink
                href={filter ? filterHref({ category: item.key }) : listHref({ category: item.key })}
                aria-current={active ? 'page' : undefined}
                className={
                  large
                    ? `flex h-10 items-center rounded-pill border px-5 text-ui font-medium whitespace-nowrap transition-colors ${
                        active ? 'border-ink bg-ink text-bg' : 'border-line bg-bg text-ink-2 hover:border-ink-4'
                      }`
                    : `flex h-8.5 items-center gap-2.5 rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors md:h-auto md:min-h-11 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-title md:whitespace-normal ${
                        active ? 'border-ink bg-ink text-bg md:text-ink' : 'border-line bg-bg text-ink-2 hover:border-ink-4 md:text-ink-4 md:hover:text-ink'
                      }`
                }
              >
                {!large && (
                  <span aria-hidden="true" className={`hidden size-1.5 flex-none rounded-pill md:block ${active ? 'bg-accent' : ''}`} />
                )}
                {item.name}
              </ListLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
