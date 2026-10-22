import { FetchError } from '@/modules/daily/collect/fetch'
import { excerpt } from '@/modules/daily/prompts/version'

import { decodeText, fetchPublic, type FetchDeps } from './fetch'
import { readPage, type IconCandidate } from './material'

/** What the profile prompts read about an app: its homepage and, when linked, its pricing page. */
export type Material = {
  /** The website as entered, and where it ended up after redirects. */
  website: string
  url: string
  title: string
  description: string
  siteName: string
  lang: string
  homepage: string
  structuredData: string
  pricing: { url: string; text: string } | null
  icons: IconCandidate[]
  image: string | null
}

const HTML_ACCEPT = 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1'
const MAX_HTML_BYTES = 2 * 1024 * 1024

/** Homepage and pricing text kept for the prompts. */
const HOMEPAGE_CHARS = 12_000
const PRICING_CHARS = 6_000

/** Less readable text than this and the profile would be guesswork. */
const MIN_MATERIAL_CHARS = 150

/** The website has too little readable text to write from (often a page that only renders with scripts). */
export class ThinMaterialError extends Error {
  constructor(readonly chars: number) {
    super(`Only ${chars} characters of readable text on the website`)
    this.name = 'ThinMaterialError'
  }
}

async function fetchHtml(url: string, deps: FetchDeps) {
  const page = await fetchPublic(url, { accept: HTML_ACCEPT, maxBytes: MAX_HTML_BYTES }, deps)
  const type = page.contentType.split(';')[0].trim().toLowerCase()
  if (type && type !== 'text/html' && type !== 'application/xhtml+xml') throw new FetchError(`Not a web page (${type})`)
  return readPage(decodeText(page.bytes, page.contentType), page.finalUrl)
}

/** Fetch the website (and its pricing page, best effort) and keep what the prompts need. */
export async function collectMaterial(website: string, deps: FetchDeps = {}): Promise<Material> {
  const home = await fetchHtml(website, deps)

  let pricing: Material['pricing'] = null
  if (home.pricingUrl) {
    try {
      const page = await fetchHtml(home.pricingUrl, deps)
      if (page.text) pricing = { url: page.url, text: excerpt(page.text, PRICING_CHARS) }
    } catch {
      // The pricing page only adds detail; the profile can be written without it.
    }
  }

  const material: Material = {
    website,
    url: home.url,
    title: home.title,
    description: home.description,
    siteName: home.siteName,
    lang: home.lang,
    homepage: excerpt(home.text, HOMEPAGE_CHARS),
    structuredData: home.structuredData,
    pricing,
    icons: home.icons,
    image: home.image,
  }
  const chars = materialText(material).length
  if (chars < MIN_MATERIAL_CHARS) throw new ThinMaterialError(chars)
  return material
}

/** Everything the model reads, as one text: what its profile is checked against. */
export function materialText(material: Material): string {
  return [material.title, material.description, material.siteName, material.structuredData, material.homepage, material.pricing?.text]
    .filter(Boolean)
    .join('\n')
}
