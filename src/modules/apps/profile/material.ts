import { parseHTML } from 'linkedom'

import { domainFromUrl, isHttpUrl } from '../normalize'

/**
 * What an app's own web page says about it, read without running its scripts. Used as material
 * for the profile prompts and to find the icon and share image; never shown as it is.
 */
export type PageInfo = {
  url: string
  title: string
  description: string
  siteName: string
  lang: string
  /** Visible text, one block per line, repeated lines once. */
  text: string
  /** JSON-LD about the app or its maker, compacted. */
  structuredData: string
  icons: IconCandidate[]
  /** The share image (og:image / twitter:image). */
  image: string | null
  /** A link on the page to the same site's pricing page. */
  pricingUrl: string | null
}

export type IconCandidate = {
  url: string
  kind: 'apple-touch-icon' | 'icon'
  /** Largest side from `sizes`; 0 when not given, Infinity for "any" (SVG). */
  size: number
  type: string
}

/** Elements whose content is not reading text. */
const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'SELECT', 'HEAD'])

/** Elements that start a new line of text. */
const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'BUTTON', 'CAPTION', 'DD', 'DETAILS', 'DIALOG', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TD', 'TH', 'TR', 'UL',
])

/** JSON-LD types worth reading, and fields that are noise or that we must not repeat (ratings, reviews). */
const STRUCTURED_TYPES = /^(SoftwareApplication|WebApplication|MobileApplication|Product|Organization|Corporation|WebSite|Offer|AggregateOffer|Brand)$/
const STRUCTURED_DROPPED = new Set(['@context', 'image', 'logo', 'screenshot', 'thumbnailUrl', 'aggregateRating', 'review', 'reviews', 'potentialAction', 'sameAs'])

const PRICING_PATH = /(?:^|\/)(?:pricing|prices?|plans?|premium|upgrade|subscriptions?)(?:\/|\.html?|$)/i
const PRICING_TEXT = /^(?:pricing|prices?|plans?(?: (?:&|and) pricing)?|pricing (?:&|and) plans|定价|价格|價格|方案|料金|料金プラン|プラン|요금|요금제|가격)$/i

const collapse = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

function absolute(href: string | null | undefined, base: string): string | null {
  if (!href?.trim()) return null
  try {
    const url = new URL(href.trim(), base)
    url.hash = ''
    return isHttpUrl(url.toString()) ? url.toString() : null
  } catch {
    return null
  }
}

/** Visible text with a line break around every block element. */
function visibleText(root: Element | null): string {
  if (!root) return ''
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '')
      return
    }
    if (node.nodeType !== 1) return
    const element = node as Element
    const tag = element.tagName.toUpperCase()
    if (SKIPPED.has(tag) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return
    const block = BLOCKS.has(tag)
    if (block) parts.push('\n')
    for (const child of Array.from(element.childNodes)) walk(child)
    if (block) parts.push('\n')
  }
  walk(root)

  const seen = new Set<string>()
  const lines: string[] = []
  for (const raw of parts.join('').split('\n')) {
    const line = collapse(raw)
    if (!line || seen.has(line)) continue
    seen.add(line)
    lines.push(line)
  }
  return lines.join('\n')
}

function sizeOf(sizes: string | null): number {
  if (!sizes) return 0
  if (/\bany\b/i.test(sizes)) return Infinity
  let largest = 0
  for (const match of sizes.matchAll(/(\d+)\s*x\s*(\d+)/gi)) largest = Math.max(largest, Number(match[1]), Number(match[2]))
  return largest
}

function iconsOf(document: Document, base: string): IconCandidate[] {
  const icons: IconCandidate[] = []
  for (const link of Array.from(document.querySelectorAll('link[rel][href]'))) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    const kind = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed') ? 'apple-touch-icon' : rel.includes('icon') ? 'icon' : null
    const url = absolute(link.getAttribute('href'), base)
    if (!kind || !url || url.startsWith('data:')) continue
    const type = (link.getAttribute('type') ?? '').toLowerCase()
    const size = sizeOf(link.getAttribute('sizes')) || (type === 'image/svg+xml' || /\.svg(?:$|\?)/i.test(url) ? Infinity : 0)
    icons.push({ url, kind, size, type })
  }
  return icons
}

function metaContent(document: Document, ...keys: string[]): string {
  for (const key of keys) {
    const element = document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
    const value = collapse(element?.getAttribute('content'))
    if (value) return value
  }
  return ''
}

function structuredDataOf(document: Document): string {
  const found: unknown[] = []
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 4) return
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1)
      return
    }
    const record = value as Record<string, unknown>
    if (record['@graph']) visit(record['@graph'], depth + 1)
    const types = ([] as unknown[]).concat(record['@type'] ?? [])
    if (types.some((type) => typeof type === 'string' && STRUCTURED_TYPES.test(type))) found.push(record)
  }
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      visit(JSON.parse(script.textContent ?? ''), 0)
    } catch {
      // Not valid JSON; ignore.
    }
  }
  if (found.length === 0) return ''
  const text = JSON.stringify(found, (key, value) => (STRUCTURED_DROPPED.has(key) ? undefined : value))
  return text.length > 3000 ? `${text.slice(0, 3000)}…` : text
}

function pricingLinkOf(document: Document, pageUrl: string): string | null {
  const site = domainFromUrl(pageUrl)
  const page = new URL(pageUrl)
  const candidates: { url: string; byPath: boolean }[] = []
  for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
    const url = absolute(anchor.getAttribute('href'), pageUrl)
    if (!url) continue
    const target = new URL(url)
    const host = domainFromUrl(url)
    const sameSite = host === site || (site !== undefined && host?.endsWith(`.${site}`))
    if (!sameSite || (target.pathname === page.pathname && target.search === page.search)) continue
    const byPath = PRICING_PATH.test(target.pathname)
    if (byPath || PRICING_TEXT.test(collapse(anchor.textContent))) candidates.push({ url, byPath })
  }
  // A path like /pricing is a better sign than the link text alone.
  return (candidates.find((candidate) => candidate.byPath) ?? candidates[0])?.url ?? null
}

/** Read one fetched page. `url` is where it was fetched from, after redirects. */
export function readPage(html: string, url: string): PageInfo {
  const { document } = parseHTML(html)
  const base = absolute(document.querySelector('base[href]')?.getAttribute('href'), url) ?? url

  return {
    url,
    title: metaContent(document, 'og:title', 'twitter:title') || collapse(document.querySelector('title')?.textContent),
    description: metaContent(document, 'description', 'og:description', 'twitter:description'),
    siteName: metaContent(document, 'og:site_name', 'application-name', 'apple-mobile-web-app-title'),
    lang: collapse(document.documentElement?.getAttribute('lang')),
    structuredData: structuredDataOf(document),
    icons: iconsOf(document, base),
    image: absolute(metaContent(document, 'og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), base),
    pricingUrl: pricingLinkOf(document, url),
    text: visibleText(document.body ?? document.documentElement),
  }
}
