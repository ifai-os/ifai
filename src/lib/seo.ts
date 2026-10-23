import type { Metadata } from 'next'

import { defaultLocale, localizePath, locales, ogLocales, type Locale } from '@/i18n/config'

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

type ShareImage = { url: string; width?: number; height?: number; alt?: string }

/** The site's own share picture: the Chinese one for both Chinese scripts. */
export function defaultShareImage(locale: Locale): ShareImage {
  return { url: locale.startsWith('zh') ? '/og-image-zh.png' : '/og-image.png', width: 1200, height: 630, alt: 'IFAI' }
}

/**
 * Open Graph and X card fields. A page's `openGraph` replaces the layout's whole object
 * (Next.js merges metadata one level deep), so every page that sets its own goes through here
 * to keep the site name, languages and a picture. Title and description are left out: Next.js
 * fills them from the page's own. Without `image` the site's share picture is used.
 */
export function shareCard(
  locale: Locale,
  {
    image,
    article,
  }: {
    image?: ShareImage | null
    /** A story: shared as an article with its times. */
    article?: { publishedTime: string; modifiedTime?: string | null }
  } = {},
): Pick<Metadata, 'openGraph' | 'twitter'> {
  const picture = image ?? defaultShareImage(locale)
  const common = {
    siteName: 'IFAI',
    locale: ogLocales[locale],
    alternateLocale: locales.filter((item) => item !== locale).map((item) => ogLocales[item]),
    images: [picture],
  }
  return {
    openGraph: article
      ? { ...common, type: 'article', publishedTime: article.publishedTime, modifiedTime: article.modifiedTime ?? undefined }
      : { ...common, type: 'website' },
    twitter: { card: 'summary_large_image', images: [picture.url] },
  }
}
