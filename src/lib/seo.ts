import type { Metadata } from 'next'

import { defaultLocale, localizePath, locales, type Locale } from '@/i18n/config'

/** Canonical URL plus hreflang alternates for a locale-less pathname such as "/apps". */
export function alternatesFor(pathname: string, locale: Locale): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {}
  for (const item of locales) languages[item] = localizePath(item, pathname)
  languages['x-default'] = localizePath(defaultLocale, pathname)

  return {
    canonical: localizePath(locale, pathname),
    languages,
  }
}
