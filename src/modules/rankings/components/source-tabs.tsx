import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'

import { getArenas } from '../data'
import { getExternalBoards } from '../external/data'
import { externalHref, externalSources, type ExternalSource } from '../external/sources'

export type SourceKey = 'ifai' | ExternalSource

const labelKey = { ifai: 'ifai', arena: 'arena', 'artificial-analysis': 'artificialAnalysis' } as const

/**
 * 「数据来源」at the top of the rankings pages: IFAI's own blind test and each outside source that
 * has a board, as buttons. Each source is its own leaderboard; switching never mixes them.
 * Hidden while there is only one.
 */
export async function SourceTabs({ locale, current }: { locale: Locale; current: SourceKey }) {
  const t = await getTranslations({ locale, namespace: 'rankingsExternal' })
  const [arenas, boards] = await Promise.all([getArenas(locale), getExternalBoards()])
  const items: { key: SourceKey; href: `/${string}` }[] = [
    ...(arenas.length ? [{ key: 'ifai' as const, href: '/rankings' as const }] : []),
    ...externalSources.filter((source) => source === current || boards[source].length > 0).map((source) => ({ key: source, href: externalHref(source) })),
  ]
  if (items.length < 2) return null

  return (
    <nav aria-label={t('sourcesLabel')} className="-mx-4 flex items-center gap-3 overflow-x-auto px-4">
      {/* The nav is named for screen readers; on a phone the buttons need the room. */}
      <span aria-hidden="true" className="hidden flex-none text-meta text-ink-4 sm:inline">
        {t('sourcesLabel')}
      </span>
      <ul className="flex flex-none gap-1 rounded-pill bg-surface p-1">
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 items-center rounded-pill px-4 text-ui font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {t(`sources.${labelKey[item.key]}`)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
