import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { PublicArena } from '../data'

type ArenaTabsProps = {
  arenas: PublicArena[]
  current: string
  /** The address of each arena's tab: its board, or its blind vote. */
  hrefOf: (arena: PublicArena) => `/${string}`
}

/** The published arenas as pill links, the current one black. Links, so every arena has its own address. */
export function ArenaTabs({ arenas, current, hrefOf }: ArenaTabsProps) {
  const t = useTranslations('rankings')
  if (arenas.length < 2) return null

  return (
    <nav aria-label={t('arenasLabel')} className="-mx-4 overflow-x-auto px-4 pb-1">
      <ul className="flex gap-2">
        {arenas.map((arena) => {
          const active = arena.slug === current
          return (
            <li key={arena.id} className="flex-none">
              <Link
                href={hrefOf(arena)}
                aria-current={active ? 'page' : undefined}
                scroll={false}
                className={`flex h-10 items-center rounded-pill border px-4 text-ui font-medium transition-colors ${
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-bg text-ink hover:border-ink-4'
                }`}
              >
                {arena.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
