import { closedModules, isLaunched, sitePhase, type ModuleKey, type Phase } from '@/config/site'

/** What the site search looks through, in navigation order (docs/specs/search.md). */
export const searchKinds = ['daily', 'apps', 'skills'] as const

export type SearchKind = (typeof searchKinds)[number]

/** The module each kind belongs to: a kind shows only while its module is open (launched and not closed for now). */
const moduleOf: Record<SearchKind, ModuleKey> = { daily: 'daily', apps: 'apps', skills: 'resources' }

export function visibleKinds(phase: Phase = sitePhase, closed: readonly ModuleKey[] = closedModules): SearchKind[] {
  return searchKinds.filter((kind) => isLaunched(moduleOf[kind], phase, closed))
}
