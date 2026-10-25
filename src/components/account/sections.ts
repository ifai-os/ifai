import { localizePath, type Locale } from '@/i18n/config'

/**
 * The「设置」page's sections (docs/specs/account.md), in the order of its menu. Circles adds
 * its own (privacy, notifications on the site) here when it gets to them.
 */
export const settingsSections = ['profile', 'sign-in', 'notifications', 'language', 'data'] as const
export type SettingsSection = (typeof settingsSections)[number]

/** `?section=`; anything else is the first section. */
export function parseSection(value: unknown): SettingsSection {
  return settingsSections.find((section) => section === value) ?? 'profile'
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
