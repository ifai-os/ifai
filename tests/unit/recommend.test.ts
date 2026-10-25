import { describe, expect, it } from 'vitest'

import { renderUrlset } from '@/lib/sitemap'
import { hotTags, picksOf, relatedArticles, selectArticles, type ArticleCard } from '@/modules/recommend/list'
import {
  cleanTags,
  isPlainList,
  listHref,
  pageSize,
  plainText,
  readArticleId,
  readingMinutes,
  readListQuery,
  tableOfContents,
  type ListQuery,
  type RichNode,
} from '@/modules/recommend/rules'

const text = (value: string): RichNode => ({ type: 'text', text: value })
const node = (type: string, children: RichNode[], extra: RichNode = {}): RichNode => ({ type, children, ...extra })
const body = (...children: RichNode[]) => ({ root: node('root', children) })

describe('recommend: list addresses', () => {
  it('reads the tab, channel, tag and page, and refuses what cannot be right', () => {
    expect(readListQuery({})).toEqual({ tab: 'picks', channel: null, tag: null, page: 1 })
    expect(readListQuery({ tab: 'latest', channel: 'agents', tag: ' RAG ', page: '2' })).toEqual({
      tab: 'latest',
      channel: 'agents',
      tag: 'RAG',
      page: 2,
    })
    for (const params of [{ tab: 'picks' }, { tab: 'following' }, { channel: 'news' }, { page: '0' }, { page: '01' }, { page: 'x' }, { tag: 'a'.repeat(21) }]) {
      expect(readListQuery(params)).toBeNull()
    }
  })

  it('writes addresses with defaults left out, so each list has one', () => {
    expect(listHref()).toBe('/recommend')
    expect(listHref({ tab: 'picks', page: 1 })).toBe('/recommend')
    expect(listHref({ tab: 'latest', channel: 'coding', tag: 'AI 编程', page: 3 })).toBe('/recommend?tab=latest&channel=coding&tag=AI+%E7%BC%96%E7%A8%8B&page=3')
    const query = readListQuery({ tab: 'latest', channel: 'coding', tag: 'AI 编程', page: '3' }) as ListQuery
    expect(readListQuery(Object.fromEntries(new URLSearchParams(listHref(query).split('?')[1])))).toEqual(query)
  })

  it('indexes only the plain first page', () => {
    expect(isPlainList({ tab: 'picks', channel: null, tag: null, page: 1 })).toBe(true)
    expect(isPlainList({ tab: 'latest', channel: null, tag: null, page: 1 })).toBe(false)
    expect(isPlainList({ tab: 'picks', channel: 'agents', tag: null, page: 1 })).toBe(false)
    expect(isPlainList({ tab: 'picks', channel: null, tag: null, page: 2 })).toBe(false)
  })

  it('reads an article number and nothing else', () => {
    expect(readArticleId('12')).toBe(12)
    for (const segment of ['0', '012', '-1', '1.5', 'abc', '99999999999']) expect(readArticleId(segment)).toBeNull()
  })
})

describe('recommend: tags', () => {
  it('trims, drops a leading #, keeps the first spelling and at most five', () => {
    expect(cleanTags(['  #RAG ', 'rag', 'Agent', '', 42, 'a  b', 'x'.repeat(30), 'six', 'seven'])).toEqual([
      'RAG',
      'Agent',
      'a b',
      'x'.repeat(20),
      'six',
    ])
  })
})

describe('recommend: the body', () => {
  const article = body(
    node('paragraph', [text('Intro '), node('link', [text('link')])]),
    node('heading', [text('First')], { tag: 'h2' }),
    node('heading', [text('Inside')], { tag: 'h3' }),
    node('list', [node('listitem', [text('one')]), node('listitem', [text('two')])]),
    node('heading', [text('  ')], { tag: 'h2' }),
    node('heading', [text('Second')], { tag: 'h2' }),
    { type: 'block', fields: { blockType: 'Code', code: 'const a = 1' } },
  )

  it('lists the second-level headings with anchors that count every one of them', () => {
    expect(tableOfContents(article)).toEqual([
      { id: 's1', text: 'First' },
      { id: 's3', text: 'Second' },
    ])
    expect(tableOfContents(null)).toEqual([])
  })

  it('reads the plain text, code included', () => {
    expect(plainText(article)).toBe('Intro link\nFirst\nInside\none\ntwo\nSecond\nconst a = 1')
  })

  it('counts 400 CJK characters or 220 words a minute, at least one', () => {
    expect(readingMinutes('')).toBe(1)
    expect(readingMinutes('字'.repeat(2000))).toBe(5)
    expect(readingMinutes(Array.from({ length: 1100 }, () => 'word').join(' '))).toBe(5)
    expect(readingMinutes(`${'字'.repeat(800)} ${Array.from({ length: 440 }, () => 'word').join(' ')}`)).toBe(4)
  })
})

function card(id: number, extra: Partial<ArticleCard> = {}): ArticleCard {
  return {
    id,
    title: `Article ${id}`,
    summary: null,
    lang: 'en',
    channel: 'agents',
    tags: [],
    cover: null,
    minutes: 3,
    publishedAt: new Date(Date.UTC(2026, 9, 25) - id * 3_600_000).toISOString(),
    updatedAt: '2026-10-25T00:00:00.000Z',
    pick: null,
    ...extra,
  }
}

describe('recommend: lists', () => {
  const picked = (at: string) => ({ at, reason: 'Worth it' })
  const articles = [
    card(1, { tags: ['RAG'] }),
    card(2, { channel: 'coding', pick: picked('2026-10-20T00:00:00.000Z'), tags: ['rag', 'Agent'] }),
    card(3, { pick: picked('2026-10-24T00:00:00.000Z') }),
    card(4, { channel: 'models', tags: ['RAG'] }),
  ]
  const query = (extra: Partial<ListQuery> = {}): ListQuery => ({ tab: 'picks', channel: null, tag: null, page: 1, ...extra })

  it('shows the picks by pick time under 推荐 and everything by date under 最新', () => {
    expect(picksOf(articles).map((article) => article.id)).toEqual([3, 2])
    expect(selectArticles(articles, query()).articles.map((article) => article.id)).toEqual([3, 2])
    expect(selectArticles(articles, query({ tab: 'latest' })).articles.map((article) => article.id)).toEqual([1, 2, 3, 4])
  })

  it('filters by channel and by tag in any case', () => {
    expect(selectArticles(articles, query({ tab: 'latest', channel: 'agents' })).articles.map((article) => article.id)).toEqual([1, 3])
    expect(selectArticles(articles, query({ tab: 'latest', tag: 'Rag' })).articles.map((article) => article.id)).toEqual([1, 2, 4])
    expect(selectArticles(articles, query({ channel: 'models' }))).toMatchObject({ tab: 'picks', articles: [], total: 0 })
  })

  it('falls back to 最新 while nothing at all is picked', () => {
    const unpicked = articles.map((article) => ({ ...article, pick: null }))
    expect(selectArticles(unpicked, query())).toMatchObject({ tab: 'latest', total: 4 })
  })

  it('pages by twenty', () => {
    const many = Array.from({ length: pageSize + 5 }, (_, index) => card(index + 1))
    const second = selectArticles(many, query({ tab: 'latest', page: 2 }))
    expect(second).toMatchObject({ total: pageSize + 5, pages: 2 })
    expect(second.articles.map((article) => article.id)).toEqual([21, 22, 23, 24, 25])
  })

  it('counts recent tags across spellings, in the most used spelling', () => {
    expect(hotTags(articles, new Date('2026-10-26T00:00:00Z'))).toEqual([
      { tag: 'RAG', count: 3 },
      { tag: 'Agent', count: 1 },
    ])
    expect(hotTags(articles, new Date('2027-06-01T00:00:00Z'))).toEqual([])
  })

  it('relates the same channel first, never the article itself', () => {
    expect(relatedArticles(articles, articles[0]).map((article) => article.id)).toEqual([3, 2, 4])
  })
})

describe('recommend: sitemap', () => {
  it('lists an article once, in its own language, without hreflang', () => {
    const xml = renderUrlset('https://ifai.io', [{ path: '/recommend/7', only: 'ja' }])
    expect(xml.match(/<url>/g)).toHaveLength(1)
    expect(xml).toContain('<loc>https://ifai.io/ja/recommend/7</loc>')
    expect(xml).not.toContain('hreflang')
  })
})
