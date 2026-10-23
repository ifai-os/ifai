import { localizePath, type Locale } from '@/i18n/config'
import { siteUrl } from '@/lib/site-url'

/**
 * Structured data (schema.org JSON-LD) for search engines. Each page builds plain objects with
 * the helpers here and renders them with <JsonLd>. Everything in it must also be on the page
 * itself: the same title, summary and dates (技术方案「SEO 验收」).
 */

export type JsonLdObject = { [key: string]: unknown }

/** An absolute address on this site, or an absolute media URL left as it is. */
export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl()}/`).href
}

/** The page's own address in a language, e.g. ("ja", "/apps/notion") → https://ifai.io/ja/apps/notion. */
export function pageUrl(locale: Locale, pathname: `/${string}`): string {
  return absoluteUrl(localizePath(locale, pathname))
}

/** IFAI as the publisher of stories and the site. */
export function siteOrganization(): JsonLdObject {
  return {
    '@type': 'Organization',
    name: 'IFAI',
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon-512.png'),
  }
}

/** The home page: the site in this language, and IFAI with its logo. */
export function siteJsonLd(locale: Locale, description: string): JsonLdObject[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'IFAI',
      url: pageUrl(locale, '/'),
      inLanguage: locale,
      description,
      publisher: siteOrganization(),
    },
    { '@context': 'https://schema.org', ...siteOrganization() },
  ]
}

/** A trail of links from the home page; the last crumb is the page itself. */
export function breadcrumbs(locale: Locale, crumbs: { name: string; path: `/${string}` }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: pageUrl(locale, crumb.path),
    })),
  }
}

/** Cut to `length` characters (not UTF-16 units), with an ellipsis when something was cut. */
export function clip(text: string, length: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : chars.join('')
}

/**
 * JSON for inside a <script> element: "<", ">" and "&" are escaped, so text such as "</script>"
 * in a title cannot end the element. Empty and null fields are left out, so builders can pass
 * optional values as they are.
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data, (_key, value: unknown) => (value === null || value === '' ? undefined : value))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
