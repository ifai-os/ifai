import { isLaunched } from '@/config/site'
import type { Locale } from '@/i18n/config'

/**
 * The seven channels, in the order the pages show them (docs/specs/recommend.md 规则 3). Keys
 * are the addresses' `?channel=` and `recommend.channels.*` in messages/*.json.
 */
export const articleChannels = ['models', 'agents', 'coding', 'prompts', 'images', 'design', 'career'] as const
export type ArticleChannel = (typeof articleChannels)[number]

export function isArticleChannel(value: unknown): value is ArticleChannel {
  return typeof value === 'string' && (articleChannels as readonly string[]).includes(value)
}

/** 推荐 is the picked articles, 最新 every published one (规则 10). */
export const articleTabs = ['picks', 'latest'] as const
export type ArticleTab = (typeof articleTabs)[number]

export const articleStatuses = ['draft', 'published', 'hidden'] as const
export type ArticleStatus = (typeof articleStatuses)[number]

/** 规则 4: at most five tags of at most 20 characters. */
export const maxTags = 5
export const maxTagLength = 20
/** 规则 2: the reason an article was picked. */
export const maxPickReasonLength = 80
export const maxTitleLength = 80
export const maxSummaryLength = 140
/** Articles on a list page. */
export const pageSize = 20

/** The languages an article can be written in: the site's five. */
export const articleLanguages: readonly Locale[] = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko']

/** The recommend module launches in phase two: until then its pages answer 404 (docs/specs/recommend.md「页面与路由」). */
export function recommendLaunched(): boolean {
  return isLaunched('recommend')
}

/** Tags as stored: trimmed, inner spaces collapsed, the first spelling of each (compared in lower case), at most five. */
export function cleanTags(values: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const tag = Array.from(value.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '')).slice(0, maxTagLength).join('')
    const key = tagKey(tag)
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length === maxTags) break
  }
  return tags
}

/** How two spellings of a tag are compared: "RAG" and "rag" are one tag. */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase()
}

// ── Addresses ────────────────────────────────────────────

export type ListQuery = { tab: ArticleTab; channel: ArticleChannel | null; tag: string | null; page: number }

export type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * The list's address parameters. Null when one cannot be right (an unknown channel or tab, a
 * page that is not a whole number from 1), so the page answers 404 rather than showing the
 * whole list under another address.
 */
export function readListQuery(params: SearchParams): ListQuery | null {
  const tab = first(params.tab)
  const channel = first(params.channel)
  const tag = first(params.tag).trim()
  const page = first(params.page)
  if (tab !== '' && tab !== 'latest') return null
  if (channel !== '' && !isArticleChannel(channel)) return null
  if (page !== '' && !/^[1-9]\d{0,4}$/.test(page)) return null
  if (Array.from(tag).length > maxTagLength) return null
  return {
    tab: tab === 'latest' ? 'latest' : 'picks',
    channel: channel === '' ? null : (channel as ArticleChannel),
    tag: tag === '' ? null : tag,
    page: page === '' ? 1 : Number(page),
  }
}

/** Whether the list is its plain first page: the only one search engines index. */
export function isPlainList(query: ListQuery): boolean {
  return query.tab === 'picks' && !query.channel && !query.tag && query.page === 1
}

/** The list's address for a query; parameters at their default are left out. */
export function listHref(query: Partial<ListQuery> = {}): `/${string}` {
  const params = new URLSearchParams()
  if (query.tab === 'latest') params.set('tab', 'latest')
  if (query.channel) params.set('channel', query.channel)
  if (query.tag) params.set('tag', query.tag)
  if (query.page && query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return search ? `/recommend?${search}` : '/recommend'
}

export function articleHref(id: number): `/${string}` {
  return `/recommend/${id}`
}

/** An article's number from its address; null unless it is a plain positive whole number. */
export function readArticleId(segment: string): number | null {
  return /^[1-9]\d{0,9}$/.test(segment) && Number(segment) <= 2_147_483_647 ? Number(segment) : null
}

// ── The body (Payload's rich text, Lexical JSON) ─────────

/** The parts of a Lexical node the module reads. */
export type RichNode = {
  type?: string
  tag?: string
  text?: string
  children?: RichNode[]
  fields?: { code?: unknown; [key: string]: unknown }
  [key: string]: unknown
}

export type RichText = { root?: RichNode } | null | undefined

/** The plain text of a node: its own text and its children's, blocks separated by line breaks. */
export function nodeText(node: RichNode | undefined): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (node.type === 'linebreak') return '\n'
  if (node.type === 'block' && typeof node.fields?.code === 'string') return node.fields.code
  const inner = (node.children ?? []).map(nodeText)
  const blocky = node.type === 'root' || node.type === 'list' || node.type === 'listitem' || node.type === 'quote'
  return inner.join(blocky ? '\n' : '')
}

/** The body's plain text, for reading time and descriptions. */
export function plainText(body: RichText): string {
  return (body?.root?.children ?? [])
    .map(nodeText)
    .filter((text) => text.trim())
    .join('\n')
}

/** A heading's anchor: its place among the second-level headings (`#s1`, `#s2` …), stable whatever the language. */
export function headingAnchor(index: number): string {
  return `s${index + 1}`
}

export type TocEntry = { id: string; text: string }

/** The second-level headings in order, for the table of contents (规则 8; shown from two up). */
export function tableOfContents(body: RichText): TocEntry[] {
  return (body?.root?.children ?? [])
    .filter((node) => node.type === 'heading' && node.tag === 'h2')
    .map((node, index) => ({ id: headingAnchor(index), text: nodeText(node).replace(/\s+/g, ' ').trim() }))
    .filter((entry) => entry.text)
}

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

/** Minutes to read (规则 9): 400 CJK characters or 220 other words a minute, at least one. */
export function readingMinutes(text: string): number {
  const characters = text.match(cjk)?.length ?? 0
  const words = text.replace(cjk, ' ').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
  return Math.max(1, Math.round(characters / 400 + words / 220))
}
