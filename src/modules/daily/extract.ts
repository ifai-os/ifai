import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

import { findMedia, type FoundMedia } from './media'
import { cleanText, toDate } from './text'
import { normalizeUrl, siteOf } from './url'

/** The readable part of an article page. Used for judging and writing only, never shown. */
export type Article = {
  title?: string
  /** Plain text of the article body. */
  text: string
  excerpt?: string
  byline?: string
  siteName?: string
  lang?: string
  publishedAt?: Date
  /** Outbound links inside the article body, normalized; what a roundup points at. */
  links: string[]
  /** The page's picture and video, for the story (docs/specs/daily.md「配图与视频」). */
  media: FoundMedia
}

/** Pages larger than this are not articles; skip them before parsing. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024

/**
 * Readability on a linkedom DOM. Returns null when the page has no readable body
 * (a listing, a paywall shell, an error page).
 */
export function extractArticle(html: string, url: string): Article | null {
  if (html.length > MAX_PAGE_BYTES) return null

  const { document } = parseHTML(withBase(html, url))
  // Readability rewrites the DOM (scripts and chrome go), so read our fallbacks first.
  const headline = cleanText(
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
      document.querySelector('article h1, main h1, h1')?.textContent,
    300,
  )
  const markupDate = publishedFromMarkup(document)
  const media = findMedia(document, url)

  let parsed: ReturnType<Readability['parse']>
  try {
    parsed = new Readability(document, { charThreshold: 200 }).parse()
  } catch {
    return null
  }
  const text = cleanText(parsed?.textContent, 60_000)
  if (!parsed || text.length < 200) return null

  const article: Article = { text, links: linksIn(parsed.content, url), media }
  // Readability keeps "Headline | Site" for short headlines; the page's own headline is cleaner.
  const title = headline || cleanText(parsed.title, 300)
  if (title) article.title = title
  const excerpt = cleanText(parsed.excerpt, 600)
  if (excerpt) article.excerpt = excerpt
  const byline = cleanText(parsed.byline, 200)
  if (byline) article.byline = byline
  const siteName = cleanText(parsed.siteName, 200)
  if (siteName) article.siteName = siteName
  if (parsed.lang) article.lang = parsed.lang
  const publishedAt = toDate(parsed.publishedTime) ?? markupDate
  if (publishedAt) article.publishedAt = publishedAt
  return article
}

/** Links in the article body, to other sites only, each once. */
function linksIn(content: string | null | undefined, pageUrl: string): string[] {
  if (!content) return []
  const site = siteOf(pageUrl)
  const links = new Set<string>()
  for (const anchor of Array.from(parseHTML(content).document.querySelectorAll('a[href]'))) {
    const url = normalizeUrl(anchor.getAttribute('href') ?? '', pageUrl)
    if (url && siteOf(url) !== site) links.add(url)
  }
  return [...links].slice(0, 100)
}

/** Give relative links a base so Readability can resolve them. */
function withBase(html: string, url: string): string {
  if (/<base\s/i.test(html)) return html
  const tag = `<base href="${url.replace(/"/g, '&quot;')}">`
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${tag}`) : `${tag}${html}`
}

/** Fallbacks when Readability found no published time: JSON-LD, then the first <time datetime>. */
function publishedFromMarkup(document: Document): Date | undefined {
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data: unknown = JSON.parse(script.textContent ?? '')
      const date = findDatePublished(data)
      if (date) return date
    } catch {
      // Not JSON; ignore.
    }
  }
  const time = document.querySelector('time[datetime]')
  return toDate(time?.getAttribute('datetime'))
}

function findDatePublished(data: unknown, depth = 0): Date | undefined {
  if (!data || typeof data !== 'object' || depth > 4) return undefined
  if (Array.isArray(data)) {
    for (const entry of data) {
      const date = findDatePublished(entry, depth + 1)
      if (date) return date
    }
    return undefined
  }
  const record = data as Record<string, unknown>
  if (typeof record.datePublished === 'string') return toDate(record.datePublished)
  return findDatePublished(record['@graph'], depth + 1)
}
