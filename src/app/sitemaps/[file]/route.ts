import { pagesOfFile, parseSitemapFile, renderUrlset, sitemapHeaders } from '@/lib/sitemap'
import { siteUrl } from '@/lib/site-url'

import { listedSections, sitemapPages } from '../sections'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ file: string }> }

/** One sitemap file, such as /sitemaps/daily-1.xml (listed in /sitemap.xml). */
export async function GET(_request: Request, { params }: Context) {
  const file = parseSitemapFile((await params).file)
  if (!file || !listedSections().includes(file.section)) return new Response('Not found', { status: 404 })
  const pages = pagesOfFile((await sitemapPages())[file.section], file.number)
  if (!pages) return new Response('Not found', { status: 404 })
  return new Response(renderUrlset(siteUrl(), pages), { headers: sitemapHeaders })
}
