import { load } from 'cheerio'

import { cleanText, toDate } from '../text'
import type { FoundItem, HtmlListConfig } from '../types'
import { normalizeUrl, siteOf } from '../url'

/**
 * Sites without a feed (Future Tools, The Rundown, Forward Future): a list page read with
 * the CSS selectors stored on the source. Dates come from the entry, or from its day group,
 * or not at all (The Rundown's list has none; a later step reads the detail page).
 */
export function readHtmlList(html: string, base: string, config: HtmlListConfig): FoundItem[] {
  const $ = load(html)
  type Scope = ReturnType<typeof $>

  const skip = new Set((config.skipHosts ?? []).map((host) => host.toLowerCase().replace(/^www\./, '')))
  const seen = new Set<string>()
  const found: FoundItem[] = []

  const readDate = (scope: Scope, selector: string | undefined) => {
    if (!selector) return undefined
    const el = scope.find(selector).first()
    if (!el.length) return undefined
    const raw = config.dateAttr ? el.attr(config.dateAttr) : (el.attr('datetime') ?? el.text())
    return toDate(raw)
  }

  const readEntry = (entry: Scope, groupDate: Date | undefined) => {
    const link = config.link
      ? entry.find(config.link).first()
      : entry.is('a[href]')
        ? entry
        : entry.find('a[href]').first()
    const href = link.attr('href')
    const url = href && normalizeUrl(href, base)
    if (!url || seen.has(url)) return
    const site = siteOf(url)
    if (site && skip.has(site)) return

    const title = cleanText(config.title ? entry.find(config.title).first().text() : link.text(), 300)
    if (!title) return
    seen.add(url)

    const item: FoundItem = { url, title }
    const summary = config.summary ? cleanText(entry.find(config.summary).first().text()) : ''
    if (summary) item.summary = summary
    const publishedAt = readDate(entry, config.date) ?? groupDate
    if (publishedAt) item.publishedAt = publishedAt
    found.push(item)
  }

  // Either the list is grouped by day (each group carries the date), or it is flat.
  const groups: Array<{ entries: Scope; date?: Date }> = config.group
    ? $(config.group)
        .toArray()
        .map((node) => {
          const group = $(node)
          return { entries: group.find(config.item), date: readDate(group, config.groupDate) }
        })
    : [{ entries: $(config.item) }]

  for (const group of groups) {
    group.entries.each((_, node) => readEntry($(node), group.date))
  }
  return found
}
