import { navItems, sitePhase, type ModuleKey, type Phase } from '@/config/site'

/** What the site search looks through, in navigation order (docs/specs/search.md). */
export const searchKinds = ['daily', 'apps', 'skills'] as const

export type SearchKind = (typeof searchKinds)[number]

/** The module each kind belongs to: a kind shows only once its module has launched. */
const moduleOf: Record<SearchKind, ModuleKey> = { daily: 'daily', apps: 'apps', skills: 'resources' }

export function visibleKinds(phase: Phase = sitePhase): SearchKind[] {
  const launched = new Set(navItems.filter((item) => item.phase <= phase).map((item) => item.key))
  return searchKinds.filter((kind) => launched.has(moduleOf[kind]))
}
