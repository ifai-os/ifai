import type { IconName } from '@/components/icon'

export type ModuleKey = 'recommend' | 'circles' | 'daily' | 'apps' | 'rankings' | 'resources' | 'wiki'

export type Phase = 1 | 2 | 3

export type NavItem = {
  key: ModuleKey
  href: `/${string}`
  icon: IconName
  /** The phase in which the module launches (see the roadmap in AGENTS.md). */
  phase: Phase
}

/** Navigation order matches the design canvas. */
export const navItems: readonly NavItem[] = [
  { key: 'recommend', href: '/recommend', icon: 'recommend', phase: 2 },
  { key: 'circles', href: '/circles', icon: 'circles', phase: 2 },
  { key: 'daily', href: '/news', icon: 'daily', phase: 1 },
  { key: 'apps', href: '/apps', icon: 'apps', phase: 1 },
  { key: 'rankings', href: '/rankings', icon: 'rankings', phase: 3 },
  { key: 'resources', href: '/resources', icon: 'resources', phase: 1 },
  { key: 'wiki', href: '/wiki', icon: 'wiki', phase: 3 },
]

export function parsePhase(value: string | undefined): Phase {
  const n = Number(value)
  return n === 2 || n === 3 ? n : 1
}

/** Current launch phase, from NEXT_PUBLIC_SITE_PHASE (defaults to 1). */
export const sitePhase: Phase = parsePhase(process.env.NEXT_PUBLIC_SITE_PHASE)

/**
 * Modules whose phase has come but that stay closed to the public for now (站长, 2026-11-04: phase
 * one goes live with the daily only, apps and resources open once they are polished). Their nav
 * entries go, their pages redirect to the daily (src/proxy.ts) and links to them are left out;
 * the back office keeps them.
 */
export const defaultClosedModules: readonly ModuleKey[] = ['apps', 'resources']

/**
 * NEXT_PUBLIC_CLOSED_MODULES, comma-separated module keys ("apps,resources"); "none" opens every
 * module of the phase. Unset (or nothing valid in it) falls back to `defaultClosedModules`.
 */
export function parseClosedModules(value: string | undefined): ModuleKey[] {
  const raw = value?.trim().toLowerCase()
  if (raw === 'none') return []
  const keys = (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is ModuleKey => navItems.some((item) => item.key === part))
  return keys.length ? [...new Set(keys)] : [...defaultClosedModules]
}

/** Modules closed for now, from NEXT_PUBLIC_CLOSED_MODULES. */
export const closedModules: readonly ModuleKey[] = parseClosedModules(process.env.NEXT_PUBLIC_CLOSED_MODULES)

export function visibleNavItems(phase: Phase = sitePhase, closed: readonly ModuleKey[] = closedModules): NavItem[] {
  return navItems.filter((item) => item.phase <= phase && !closed.includes(item.key))
}

export function upcomingNavItems(phase: Phase = sitePhase): NavItem[] {
  return navItems.filter((item) => item.phase > phase)
}

/**
 * Whether a module is open to the public: its phase has come and it is not closed for now. Its
 * pages, API and links exist only then.
 */
export function isLaunched(key: ModuleKey, phase: Phase = sitePhase, closed: readonly ModuleKey[] = closedModules): boolean {
  return !closed.includes(key) && navItems.some((item) => item.key === key && item.phase <= phase)
}

/**
 * Where「home」is: the home page is mostly apps and Skills, so while either is closed the logo and
 * the bare locale address go to the daily instead.
 */
export function homeHref(closed: readonly ModuleKey[] = closedModules): '/' | '/news' {
  return closed.includes('apps') || closed.includes('resources') ? '/news' : '/'
}

/** Top-level page sections that belong to a module, as the first path segment after the locale. */
const moduleSections: Partial<Record<ModuleKey, string>> = { apps: 'apps', resources: 'resources' }

/**
 * Where a locale-less pathname ("/", "/apps/notion") goes instead while its module is closed;
 * null when it is open. Closed pages go to the daily list.
 */
export function closedPathRedirect(pathname: string, closed: readonly ModuleKey[] = closedModules): string | null {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/') return homeHref(closed) === '/' ? null : '/news'
  const section = clean.split('/')[1]
  const closedHere = closed.some((key) => moduleSections[key] === section)
  return closedHere ? '/news' : null
}
