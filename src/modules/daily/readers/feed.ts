import { parseFeed } from 'feedsmith'

import { cleanText, toDate } from '../text'
import type { FoundItem } from '../types'
import { normalizeUrl } from '../url'

type Candidate = {
  url: string | undefined
  title: string | undefined
  summary: string | undefined
  publishedAt: string | undefined
  externalId: string | undefined
}

/**
 * RSS 2.0, Atom, RDF and JSON Feed, in one reader (feedsmith detects the format).
 * `base` resolves relative links; `maxLength` caps the summary we keep.
 */
export function readFeed(text: string, base?: string): FoundItem[] {
  const parsed = parseFeed(text)
  const candidates: Candidate[] = []

  switch (parsed.format) {
    case 'rss':
    case 'rdf':
      for (const item of parsed.feed.items ?? []) {
        const guid = 'guid' in item ? item.guid?.value : undefined
        candidates.push({
          url: item.link ?? (guid && /^https?:\/\//i.test(guid) ? guid : undefined),
          title: item.title,
          summary: ('content' in item ? item.content?.encoded : undefined) ?? item.description,
          publishedAt: ('pubDate' in item ? item.pubDate : undefined) ?? item.dc?.dates?.[0],
          externalId: guid,
        })
      }
      break
    case 'atom':
      for (const entry of parsed.feed.entries ?? []) {
        const links = entry.links ?? []
        const alternate = links.find((link) => !link.rel || link.rel === 'alternate') ?? links[0]
        candidates.push({
          url: alternate?.href,
          title: entry.title?.value,
          summary: entry.summary?.value ?? entry.content?.value,
          publishedAt: entry.published ?? entry.updated,
          externalId: entry.id,
        })
      }
      break
    case 'json':
      for (const item of parsed.feed.items ?? []) {
        candidates.push({
          url: item.url ?? item.external_url,
          title: item.title,
          summary: item.summary ?? item.content_text ?? item.content_html,
          publishedAt: item.date_published,
          externalId: item.id,
        })
      }
      break
  }

  const seen = new Set<string>()
  const found: FoundItem[] = []
  for (const candidate of candidates) {
    const url = candidate.url && normalizeUrl(candidate.url, base)
    const title = cleanText(candidate.title, 300)
    if (!url || !title || seen.has(url)) continue
    seen.add(url)
    const item: FoundItem = { url, title }
    const summary = cleanText(candidate.summary)
    if (summary) item.summary = summary
    const publishedAt = toDate(candidate.publishedAt)
    if (publishedAt) item.publishedAt = publishedAt
    if (candidate.externalId) item.externalId = candidate.externalId
    found.push(item)
  }
  return found
}
