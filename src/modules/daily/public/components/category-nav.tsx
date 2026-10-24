import { useTranslations } from 'next-intl'

import { ListLink } from '@/components/states/list-navigation'

import { storyCategories, type StoryCategory } from '../../categories'
import { listHref } from '../list-params'

type CategoryNavProps = {
  current: StoryCategory | null
  /** The category pages' larger pills (「IFAI 日报 · 分类页」board), which wrap on wide screens; the daily list has chips. */
  large?: boolean
}

/** All stories plus the seven categories, as a row that scrolls sideways on phones. */
export function CategoryNav({ current, large = false }: CategoryNavProps) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const items: { key: StoryCategory | null; name: string }[] = [
    { key: null, name: t('allCategories') },
    ...storyCategories.map((key) => ({ key, name: names(key) })),
  ]

  return (
    <nav aria-label={t('filterLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className={`flex ${large ? 'gap-2.5 md:flex-wrap' : 'gap-2'}`}>
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key ?? 'all'} className="flex-none">
              <ListLink
                href={listHref({ category: item.key })}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center rounded-pill border whitespace-nowrap transition-colors ${
                  large ? 'h-10 px-5 text-ui font-medium' : 'h-8.5 gap-2 px-3.5 text-meta'
                } ${active ? 'border-ink bg-ink text-white' : 'border-line bg-bg text-ink-2 hover:border-ink-4'}`}
              >
                {item.name}
              </ListLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
