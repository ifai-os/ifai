import type { SitemapPage } from '@/lib/sitemap'

import { findEntriesForSitemap, getTopicsWithEntries } from './data'
import { entriesHref, entryHref, topicHref, wikiHref, wikiLaunched } from './links'

/**
 * The Wiki pages in the sitemap (docs/specs/wiki.md「页面与路由」): the home page, 全部条目 and
 * the topics that have entries, then every published entry. Nothing before the Wiki launches;
 * one type of 全部条目 is noindex and stays out.
 */
export async function wikiSitemap(): Promise<{ pages: SitemapPage[]; entries: SitemapPage[] }> {
  if (!wikiLaunched()) return { pages: [], entries: [] }
  const [topics, entries] = await Promise.all([getTopicsWithEntries('en'), findEntriesForSitemap()])
  return {
    pages: [{ path: wikiHref }, { path: entriesHref() }, ...topics.map((topic) => ({ path: topicHref(topic.slug) }))],
    entries: entries.map((entry) => ({ path: entryHref(entry.slug), lastModified: entry.updatedAt })),
  }
}
