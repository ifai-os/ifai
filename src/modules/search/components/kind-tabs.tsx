import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { SearchKind } from '../kinds'
import { searchHref, type SearchType } from '../params'

type KindTabsProps = {
  q: string
  current: SearchType
  kinds: SearchKind[]
  totals: Record<SearchKind, number>
}

/** 全部 / 日报 / 应用 / Skills with how many each found. Links, so every tab has its own address. */
export function KindTabs({ q, current, kinds, totals }: KindTabsProps) {
  const t = useTranslations('search')
  const all = kinds.reduce((sum, kind) => sum + totals[kind], 0)
  const tabs: { type: SearchType; count: number }[] = [{ type: 'all', count: all }, ...kinds.map((kind) => ({ type: kind, count: totals[kind] }))]

  return (
    <nav aria-label={t('typesLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-0.5 rounded-pill border border-surface-2 bg-surface p-0.75">
        {tabs.map(({ type, count }) => {
          const active = type === current
          return (
            <li key={type}>
              <Link
                href={searchHref({ q, type })}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-pill px-4 text-meta font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-bg text-ink shadow-divider' : 'text-ink-4 hover:text-ink'
                }`}
              >
                {t(`tabs.${type}`)}
                <span className="tabular-nums">{count}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
