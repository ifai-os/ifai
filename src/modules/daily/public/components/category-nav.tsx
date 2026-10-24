import { useTranslations } from 'next-intl'

import { ListLink } from '@/components/states/list-navigation'

import { storyCategories, type StoryCategory } from '../../categories'
import { listHref } from '../list-params'

/** All stories plus the five categories, as a row of chips that scrolls sideways on phones. */
export function CategoryNav({ current }: { current: StoryCategory | null }) {
  const t = useTranslations('daily')
  const names = useTranslations('categories')
  const items: { key: StoryCategory | null; name: string }[] = [
    { key: null, name: t('allCategories') },
    ...storyCategories.map((key) => ({ key, name: names(key) })),
  ]

  return (
    <nav aria-label={t('filterLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2">
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key ?? 'all'} className="flex-none">
              <ListLink
                href={listHref({ category: item.key })}
                aria-current={active ? 'page' : undefined}
                className={`flex h-8.5 items-center gap-2 rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors ${
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-bg text-ink-2 hover:border-ink-4'
                }`}
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
