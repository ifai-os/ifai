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
  { key: 'daily', href: '/daily', icon: 'daily', phase: 1 },
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

export function visibleNavItems(phase: Phase = sitePhase): NavItem[] {
  return navItems.filter((item) => item.phase <= phase)
}

export function upcomingNavItems(phase: Phase = sitePhase): NavItem[] {
  return navItems.filter((item) => item.phase > phase)
}

/** Whether a module has launched in this phase: its pages and API exist only then. */
export function isLaunched(key: ModuleKey, phase: Phase = sitePhase): boolean {
  return navItems.some((item) => item.key === key && item.phase <= phase)
}
