import { siteUrl } from '@/lib/site-url'
import type { Source } from '@/payload-types'

import { MAX_PAGE_BYTES } from '../extract'
import { readFeed } from '../readers/feed'
import { readHackerNews } from '../readers/hacker-news'
import { readHtmlList } from '../readers/html-list'
import { jsonConfigSchema } from '../source-config'
import { htmlListConfigSchema, type FoundItem } from '../types'

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

export type Fetched = {
  body: string
  status: number
  contentType: string
  /** After redirects. */
  finalUrl: string
}

const ACCEPT =
  'text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml, application/json;q=0.9, */*;q=0.5'

/** Feeds with full-text entries run larger than article pages. */
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024

/** Identifies our crawler to the sites we read. */
export function userAgent(): string {
  return `IFAIBot/0.1 (+${siteUrl()})`
}

/** One page or feed as text, with a timeout and a size cap. Non-2xx responses throw. */
export async function fetchText(
  url: string,
  { timeoutMs = 20_000, maxBytes = MAX_PAGE_BYTES }: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Fetched> {
  const response = await fetch(url, {
    headers: { 'user-agent': userAgent(), accept: ACCEPT, 'accept-language': 'en' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new FetchError(`HTTP ${response.status}`, response.status)

  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) throw new FetchError(`Response too large (${declared} bytes)`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > maxBytes) throw new FetchError(`Response too large (${buffer.byteLength} bytes)`)

  const contentType = response.headers.get('content-type') ?? ''
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  let body: string
  try {
    body = new TextDecoder(charset ?? 'utf-8').decode(buffer)
  } catch {
    body = new TextDecoder().decode(buffer)
  }
  return { body, status: response.status, contentType, finalUrl: response.url || url }
}

/** Turn a fetched body into items with the reader the source's type asks for. */
export function readSource(source: Pick<Source, 'type' | 'url' | 'config'>, body: string): FoundItem[] {
  switch (source.type) {
    case 'rss':
      return readFeed(body, source.url)
    case 'html_list':
      return readHtmlList(body, source.url, htmlListConfigSchema.parse(source.config))
    case 'json': {
      const config = jsonConfigSchema.parse(source.config)
      return readHackerNews(JSON.parse(body), { minPoints: config.minPoints })
    }
  }
}

export type TestFetchResult = {
  ok: boolean
  error?: string
  /** Items found, and how many of them have no date. */
  count: number
  undated: number
  /** The first items, for the owner to eyeball. */
  items: FoundItem[]
  durationMs: number
}

/** The「试抓」button: fetch and read once, store nothing. */
export async function testFetch(source: Pick<Source, 'type' | 'url' | 'config'>): Promise<TestFetchResult> {
  const started = Date.now()
  try {
    const { body } = await fetchText(source.url, { maxBytes: MAX_SOURCE_BYTES })
    const items = readSource(source, body)
    return {
      ok: true,
      count: items.length,
      undated: items.filter((item) => !item.publishedAt).length,
      items: items.slice(0, 20),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error), count: 0, undated: 0, items: [], durationMs: Date.now() - started }
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : ''
    return `${error.name}: ${error.message}${cause}`.slice(0, 1000)
  }
  return String(error).slice(0, 1000)
}
