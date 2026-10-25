import { isLaunched, sitePhase, type Phase } from '@/config/site'
import { localizePath, type Locale } from '@/i18n/config'

/**
 * The「设置」page's sections (docs/specs/account.md), in the order of its menu. Circles adds
 * 「隐私」(docs/specs/circles.md: whom one blocked; later its switches) and, later, notifications
 * on the site.
 */
const allSections = ['profile', 'sign-in', 'notifications', 'privacy', 'language', 'data'] as const
export type SettingsSection = (typeof allSections)[number]

/** The sections in this phase:「隐私」comes with the circles. */
export function sectionsFor(phase: Phase): SettingsSection[] {
  return allSections.filter((section) => section !== 'privacy' || isLaunched('circles', phase))
}

export const settingsSections: readonly SettingsSection[] = sectionsFor(sitePhase)

/** `?section=`, among the sections there are; anything else is the first section. */
export function parseSection(value: unknown, sections: readonly SettingsSection[] = settingsSections): SettingsSection {
  return sections.find((section) => section === value) ?? 'profile'
}

/** The section's address without the language prefix, for `Link` and the router. */
export function sectionHref(section: SettingsSection): `/${string}` {
  return section === 'profile' ? '/me/account' : `/me/account?section=${section}`
}

/** The section's address with the language prefix, for Better Auth's callback URLs. */
export function sectionPath(locale: Locale, section: SettingsSection, query = ''): string {
  const path = localizePath(locale, sectionHref(section))
  return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path
}
