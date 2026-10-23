import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { searchHref } from '../params'

/** 「热门」: names to search with one click, under an empty or fruitless search. */
export function PopularSearches({ names }: { names: string[] }) {
  const t = useTranslations('search')
  if (names.length === 0) return null

  return (
    <section aria-labelledby="popular-searches" className="flex flex-col gap-2">
      <h2 id="popular-searches" className="text-meta text-ink-4">
        {t('popular')}
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li key={name}>
            <Link
              href={searchHref({ q: name })}
              className="flex h-8 items-center rounded-pill border border-surface-2 bg-bg px-3 text-ui text-ink hover:border-ink-4"
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
