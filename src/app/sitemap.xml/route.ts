import { fileCount, newest, pagesOfFile, renderIndex, sitemapFilePath, sitemapHeaders, sitemapSections } from '@/lib/sitemap'
import { siteUrl } from '@/lib/site-url'

import { sitemapPages } from '../sitemaps/sections'

export const dynamic = 'force-dynamic'

/** The sitemap index: one file per section, split when a section outgrows a file. */
export async function GET() {
  const sections = await sitemapPages()
  const files = sitemapSections.flatMap((section) =>
    Array.from({ length: fileCount(sections[section].length) }, (_, index) => ({
      path: sitemapFilePath(section, index + 1),
      lastModified: newest(pagesOfFile(sections[section], index + 1) ?? []),
    })),
  )
  return new Response(renderIndex(siteUrl(), files), { headers: sitemapHeaders })
}
