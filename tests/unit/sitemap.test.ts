import { describe, expect, it } from 'vitest'

import { robotsFor } from '@/lib/robots'
import { fileCount, newest, pagesOfFile, pagesPerFile, parseSitemapFile, renderIndex, renderUrlset } from '@/lib/sitemap'

const origin = 'https://ifai.io'

describe('sitemap files', () => {
  it('reads file names and nothing else', () => {
    expect(parseSitemapFile('daily-2.xml')).toEqual({ section: 'daily', number: 2 })
    expect(parseSitemapFile('pages-1.xml')).toEqual({ section: 'pages', number: 1 })
    for (const name of ['daily-0.xml', 'daily-01.xml', 'daily.xml', 'other-1.xml', 'daily-1.xml.gz', 'daily-1']) {
      expect(parseSitemapFile(name)).toBeNull()
    }
  })

  it('splits a section so no file passes 50,000 addresses', () => {
    expect(pagesPerFile * 5).toBeLessThanOrEqual(50_000)
    expect(fileCount(0)).toBe(1)
    expect(fileCount(pagesPerFile)).toBe(1)
    expect(fileCount(pagesPerFile + 1)).toBe(2)
    const pages = Array.from({ length: pagesPerFile + 3 }, (_, index) => index)
    expect(pagesOfFile(pages, 1)).toHaveLength(pagesPerFile)
    expect(pagesOfFile(pages, 2)).toEqual([pagesPerFile, pagesPerFile + 1, pagesPerFile + 2])
    expect(pagesOfFile(pages, 3)).toBeNull()
    expect(pagesOfFile([], 1)).toEqual([])
  })
})

describe('renderUrlset', () => {
  const xml = renderUrlset(origin, [
    { path: '/', lastModified: '2026-10-22T08:00:00.000Z' },
    { path: '/resources?category=coding' },
  ])

  it('lists every language of every page with the same hreflang set as the page head', () => {
    expect(xml.match(/<url>/g)).toHaveLength(10)
    for (const prefix of ['/en', '/zh-hans', '/zh-hant', '/ja', '/ko']) {
      expect(xml).toContain(`<loc>${origin}${prefix}</loc>`)
      expect(xml).toContain(`<loc>${origin}${prefix}/resources?category=coding</loc>`)
    }
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="zh-Hant" href="${origin}/zh-hant"/>`)
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${origin}/en/resources?category=coding"/>`)
    expect(xml.match(/hreflang=/g)).toHaveLength(10 * 6)
  })

  it('writes lastmod only when known', () => {
    expect(xml.match(/<lastmod>2026-10-22T08:00:00.000Z<\/lastmod>/g)).toHaveLength(5)
    expect(xml.match(/<lastmod>/g)).toHaveLength(5)
  })

  it('escapes addresses', () => {
    expect(renderUrlset(origin, [{ path: '/apps?a=1&b=2' }])).toContain('/en/apps?a=1&amp;b=2</loc>')
  })
})

describe('renderIndex', () => {
  it('lists the files with the newest date of each', () => {
    const pages = [{ path: '/a' as const, lastModified: '2026-10-01T00:00:00.000Z' }, { path: '/b' as const, lastModified: new Date('2026-10-03T00:00:00Z') }, { path: '/c' as const }]
    const xml = renderIndex(origin, [{ path: '/sitemaps/daily-1.xml', lastModified: newest(pages) }, { path: '/sitemaps/apps-1.xml' }])
    expect(xml).toContain(`<loc>${origin}/sitemaps/daily-1.xml</loc>\n<lastmod>2026-10-03T00:00:00.000Z</lastmod>`)
    expect(xml).toContain(`<loc>${origin}/sitemaps/apps-1.xml</loc>\n</sitemap>`)
    expect(newest([])).toBeNull()
  })
})

describe('robotsFor', () => {
  it('lets crawlers read noindex pages and blocks only what is not a page', () => {
    expect(robotsFor(origin, { VERCEL_ENV: 'production' })).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/*/apps/*/visit'] },
      sitemap: `${origin}/sitemap.xml`,
    })
    expect(robotsFor(origin, {})).toHaveProperty('sitemap')
  })

  it('blocks everything on preview deployments', () => {
    expect(robotsFor(origin, { VERCEL_ENV: 'preview' })).toEqual({ rules: { userAgent: '*', disallow: '/' } })
  })
})
