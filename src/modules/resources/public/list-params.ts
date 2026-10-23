import { skillCategories, type SkillCategory } from '../categories'

/** Longest search, tag or author passed on; longer input is cut. */
const maxQueryLength = 64

/** 综合 / 近期飙升 / 安装数 / 最近上新 (docs/specs/resources.md「页面与路由」). */
export const skillSorts = ['default', 'rising', 'installs', 'newest'] as const

export type SkillSort = (typeof skillSorts)[number]

export type SearchParams = Record<string, string | string[] | undefined>

export type SkillListParams = {
  category: SkillCategory | null
  sort: SkillSort
  q: string
  /** A tag's slug. */
  tag: string
  /** An author's name, exactly as shown on the Skill. */
  author: string
  /** 无需 API Key */
  noKey: boolean
  /** 仅看认证 */
  certified: boolean
  /** Null when `?page=` is not a whole number from 1 up, so the page can answer 404. */
  page: number | null
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function cleanText(value: string): string {
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, maxQueryLength).join('').trim()
}

/**
 * Everything the Skills list keeps in its address, so a refresh or a shared link shows the
 * same list. Unknown categories and sorts fall back to all and 综合.
 */
export function readSkillListParams(params: SearchParams): SkillListParams {
  const category = first(params.category)
  const sort = first(params.sort)
  const tag = first(params.tag).trim().toLowerCase()
  const page = first(params.page)
  return {
    category: (skillCategories as readonly string[]).includes(category) ? (category as SkillCategory) : null,
    sort: (skillSorts as readonly string[]).includes(sort) ? (sort as SkillSort) : 'default',
    q: cleanText(first(params.q)),
    tag: /^[a-z0-9-]{1,64}$/.test(tag) ? tag : '',
    author: cleanText(first(params.author)),
    noKey: first(params.nokey) === '1',
    certified: first(params.certified) === '1',
    page: page === '' ? 1 : /^[1-9]\d{0,5}$/.test(page) ? Number(page) : null,
  }
}

export type SkillListHref = Partial<Omit<SkillListParams, 'page'>> & { page?: number }

/** Address of the Skills list, leaving out every default so plain lists have plain addresses. */
export function skillsHref({ category, sort, q, tag, author, noKey, certified, page }: SkillListHref = {}): `/${string}` {
  const query = new URLSearchParams()
  if (category) query.set('category', category)
  if (q) query.set('q', q)
  if (tag) query.set('tag', tag)
  if (author) query.set('author', author)
  if (noKey) query.set('nokey', '1')
  if (certified) query.set('certified', '1')
  if (sort && sort !== 'default') query.set('sort', sort)
  if (page && page > 1) query.set('page', String(page))
  const search = query.toString()
  return search ? `/resources?${search}` : '/resources'
}

/** Whether the list is narrowed by anything beyond the category. */
export function isFiltered({ q, tag, author, noKey, certified }: SkillListHref): boolean {
  return Boolean(q || tag || author || noKey || certified)
}

export function skillHref(slug: string): `/${string}` {
  return `/resources/skills/${slug}`
}

export function versionHref(slug: string, version: string): `/${string}` {
  return `/resources/skills/${slug}/v/${version}`
}

/** A file inside a version; each path segment is encoded on its own so the slashes stay. */
export function fileHref(slug: string, version: string, path: string): `/${string}` {
  return `/resources/skills/${slug}/v/${version}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** The install guide; `#verify` is its fingerprint section. */
export const guideHref = '/resources/guide'
