import { isLaunched } from '@/config/site'

import { isEntryType, type EntryType } from './rules'

/** Wiki is a phase-three module (docs/specs/wiki.md, rule 11): its pages exist only once it has launched. */
export function wikiLaunched(): boolean {
  return isLaunched('wiki')
}

export const wikiHref = '/wiki' as const

export function entryHref(slug: string): `/${string}` {
  return `/wiki/${slug}`
}

export function topicHref(slug: string): `/${string}` {
  return `/wiki/topics/${slug}`
}

export type SearchParams = Record<string, string | string[] | undefined>

export type EntriesParams = {
  type: EntryType | null
  /** Null when `?page=` is not a whole number from 1 up, so the page can answer 404. */
  page: number | null
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** `?type=` and `?page=` of 全部条目; an unknown type shows both. */
export function readEntriesParams(params: SearchParams): EntriesParams {
  const type = first(params.type)
  const page = first(params.page)
  return {
    type: isEntryType(type) ? type : null,
    page: page === '' ? 1 : /^[1-9]\d{0,5}$/.test(page) ? Number(page) : null,
  }
}

/** Address of 全部条目, leaving out the defaults. */
export function entriesHref({ type, page }: { type?: EntryType | null; page?: number } = {}): `/${string}` {
  const query = new URLSearchParams()
  if (type) query.set('type', type)
  if (page && page > 1) query.set('page', String(page))
  const search = query.toString()
  return search ? `/wiki/entries?${search}` : '/wiki/entries'
}
