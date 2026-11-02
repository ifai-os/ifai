import { z } from 'zod'

import type { Locale } from '@/i18n/config'
import { hitsPerPage, searchEverything, searchOneKind, type KindResult, type SearchHit } from '@/modules/search/data'
import { visibleKinds, type SearchKind } from '@/modules/search/kinds'
import { cleanQuery, maxQueryLength } from '@/modules/search/params'

import { facts, lines, oneLine, utc } from '../markdown'
import { defineOperation, notFound } from './types'
import { langParam, pageParam, pageUrl, pagesFor } from './shared'

/**
 * The site search (docs/specs/search.md) for agents: news, apps and Skills, ranked as on the
 * search page (names first). Only the kinds whose modules have launched.
 */

/** The kinds as agents name them: the daily news is `news`, as in the other tools. */
const kindNames = { news: 'daily', apps: 'apps', skills: 'skills' } as const satisfies Record<string, SearchKind>
type KindName = keyof typeof kindNames
const nameOf = (kind: SearchKind): KindName => (kind === 'daily' ? 'news' : kind)

export type SearchHitItem = {
  kind: KindName
  slug: string
  url: string
  title: string
  summary: string | null
  /** The language of `summary` (and of `title` for news and Skills). */
  lang: Locale | null
  category: string | null
  publishedAt?: string
  author?: string
}

export type SearchGroup = { kind: KindName; total: number; hits: SearchHitItem[] }

export type SearchView = { q: string; kind: 'all' | KindName; page: number; pages: number; groups: SearchGroup[] }

function hitItem(hit: SearchHit, locale: Locale, origin: string): SearchHitItem {
  const common = {
    kind: nameOf(hit.kind),
    slug: hit.slug,
    url: pageUrl(origin, locale, hit.href),
    title: hit.title.value,
    summary: hit.summary?.value ?? null,
    lang: hit.summary?.lang ?? hit.title.lang ?? null,
  }
  if (hit.kind === 'daily') return { ...common, category: hit.category, publishedAt: hit.publishedAt }
  if (hit.kind === 'apps') return { ...common, category: hit.category }
  return { ...common, category: hit.category, author: hit.author }
}

const groupOf = (result: KindResult, locale: Locale, origin: string): SearchGroup => ({
  kind: nameOf(result.kind),
  total: result.total,
  hits: result.hits.map((hit) => hitItem(hit, locale, origin)),
})

const readWith: Record<KindName, string> = { news: 'read_news', apps: 'read_app', skills: 'read_skill' }

export const search = defineOperation({
  name: 'search',
  tool: 'search',
  title: 'Search IFAI',
  description:
    'Search IFAI’s daily news, AI apps and Agent Skills by name and text, best matches (names first) at the top. ' +
    '`kind` all gives the first 5 of each with their totals; news, apps or skills gives 20 a page of one. Read a result with read_news, read_app or read_skill and its slug.',
  module: null,
  path: '/search',
  input: z.object({
    q: z.string().trim().min(1).max(200).describe('What to look for: a name, a company, a topic.'),
    kind: z.enum(['all', 'news', 'apps', 'skills']).default('all').describe('all, news, apps or skills.'),
    lang: langParam,
    page: pageParam,
  }),
  async run({ q, kind, lang, page }, { origin }): Promise<SearchView> {
    const query = cleanQuery(q).slice(0, maxQueryLength)
    const visible = visibleKinds()
    if (kind === 'all') {
      const results = await searchEverything(query, lang)
      return { q: query, kind, page: 1, pages: 1, groups: results.map((result) => groupOf(result, lang, origin)) }
    }
    if (!visible.includes(kindNames[kind])) throw notFound(`IFAI does not search ${kind} yet.`)
    const { result } = await searchOneKind(kindNames[kind], query, lang, page)
    return { q: query, kind, page, pages: pagesFor(result.total, hitsPerPage), groups: [groupOf(result, lang, origin)] }
  },
  markdown({ q, kind, page, pages, groups }) {
    const total = groups.reduce((sum, group) => sum + group.total, 0)
    if (!total) return `Nothing on IFAI matches "${q}".`
    return lines(
      kind === 'all' ? `Results for "${q}":` : `${total} ${kind} for "${q}" · page ${page} of ${pages}`,
      ...groups
        .filter((group) => group.total > 0)
        .map((group) =>
          lines(
            '',
            kind === 'all' ? `## ${group.kind} (${group.total}${group.total > group.hits.length ? `, first ${group.hits.length}; more with kind=${group.kind}` : ''})` : null,
            ...group.hits.map((hit, index) =>
              lines(
                `${index + 1}. **${oneLine(hit.title)}**${hit.summary ? `: ${oneLine(hit.summary)}` : ''}`,
                `   ${facts(hit.category, hit.author ? `by ${hit.author}` : null, utc(hit.publishedAt), `slug \`${hit.slug}\``, hit.url)}`,
              ),
            ),
            `Read one with ${readWith[group.kind]}.`,
          ),
        ),
      kind !== 'all' && page < pages ? `\nMore: call again with page=${page + 1}.` : null,
    )
  },
})

export const searchOperations = [search]
