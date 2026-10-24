import { defaultLocale, localizePath, locales } from '@/i18n/config'

/**
 * Sitemaps (docs/specs/foundation.md「站点地图与 robots.txt」). A page is a locale-less pathname
 * ("/apps/notion") that exists in every language; each language's address is listed on its
 * own, with the same hreflang set the page's <head> prints (src/lib/seo.ts), so the sitemap
 * and the pages agree.
 */
export type SitemapPage = {
  path: `/${string}`
  /** When the content last changed; left out when unknown rather than guessed. */
  lastModified?: Date | string | null
}

/** One sitemap file per this many pages: five addresses each, under the 50,000-URL limit. */
export const pagesPerFile = 9000

/** Sections of the sitemap, each split into numbered files ("daily-1.xml"). */
export const sitemapSections = ['pages', 'daily', 'apps', 'skills', 'wiki'] as const
export type SitemapSection = (typeof sitemapSections)[number]

const fileName = /^(pages|daily|apps|skills|wiki)-([1-9]\d{0,3})\.xml$/

/** "daily-2.xml" → section and 1-based number; null for anything else. */
export function parseSitemapFile(name: string): { section: SitemapSection; number: number } | null {
  const match = fileName.exec(name)
  if (!match) return null
  return { section: match[1] as SitemapSection, number: Number(match[2]) }
}

export function sitemapFilePath(section: SitemapSection, number: number): `/${string}` {
  return `/sitemaps/${section}-${number}.xml`
}

/** How many files a section of this many pages takes; an empty section still has one (empty) file. */
export function fileCount(pages: number): number {
  return Math.max(1, Math.ceil(pages / pagesPerFile))
}

/** The pages of one file (1-based), or null past the last file. */
export function pagesOfFile<T>(pages: T[], number: number): T[] | null {
  if (number < 1 || number > fileCount(pages.length)) return null
  return pages.slice((number - 1) * pagesPerFile, number * pagesPerFile)
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[char]};`)
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** A <urlset> with every language of every page, each carrying the full hreflang set. */
export function renderUrlset(origin: string, pages: SitemapPage[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ]
  for (const page of pages) {
    const alternates = [
      ...locales.map((locale) => [locale, localizePath(locale, page.path)] as const),
      ['x-default', localizePath(defaultLocale, page.path)] as const,
    ].map(([lang, path]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(origin + path)}"/>`)
    const lastModified = isoDate(page.lastModified)
    for (const locale of locales) {
      lines.push(
        '<url>',
        `<loc>${escapeXml(origin + localizePath(locale, page.path))}</loc>`,
        ...alternates,
        ...(lastModified ? [`<lastmod>${lastModified}</lastmod>`] : []),
        '</url>',
      )
    }
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}

/** The <sitemapindex> listing the section files. */
export function renderIndex(origin: string, files: { path: string; lastModified?: Date | string | null }[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  for (const file of files) {
    const lastModified = isoDate(file.lastModified)
    lines.push('<sitemap>', `<loc>${escapeXml(origin + file.path)}</loc>`, ...(lastModified ? [`<lastmod>${lastModified}</lastmod>`] : []), '</sitemap>')
  }
  lines.push('</sitemapindex>', '')
  return lines.join('\n')
}

/** The newest of the pages' dates, for the index entry of their file. */
export function newest(pages: SitemapPage[]): string | null {
  let best: string | null = null
  for (const page of pages) {
    const date = isoDate(page.lastModified)
    if (date && (!best || date > best)) best = date
  }
  return best
}

export const sitemapHeaders = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
}
