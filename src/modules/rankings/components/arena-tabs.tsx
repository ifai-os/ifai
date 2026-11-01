import { useTranslations } from 'next-intl'

import type { PublicArena } from '../data'
import { PillTabs } from './pill-tabs'

type ArenaTabsProps = {
  arenas: PublicArena[]
  current: string
  /** The address of each arena's tab: its board, or its blind vote. */
  hrefOf: (arena: PublicArena) => `/${string}`
}

/** The published arenas as pill links, the current one black. Links, so every arena has its own address. */
export function ArenaTabs({ arenas, current, hrefOf }: ArenaTabsProps) {
  const t = useTranslations('rankings')
  return (
    <PillTabs
      label={t('arenasLabel')}
      items={arenas.map((arena) => ({ key: arena.slug, name: arena.name, href: hrefOf(arena) }))}
      current={current}
    />
  )
}
