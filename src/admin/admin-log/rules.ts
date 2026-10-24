/**
 * The back office's admin log page (docs/specs/foundation.md「后台 · 操作记录」): reading the
 * filters from the address, as pure functions so they can be tested without a database.
 */
import type { LogKind } from '@/lib/admin-log/rules'

export const PAGE_SIZE = 50

export const logKinds: readonly LogKind[] = ['create', 'update', 'delete', 'action', 'login']

export type LogFilters = {
  collection: string | null
  doc: string | null
  admin: string | null
  kind: LogKind | null
  page: number
}

type Params = Record<string, string | string[] | undefined> | undefined

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const text = raw?.trim()
  return text ? text : null
}

/** ?collection=apps&doc=12&admin=3&kind=delete&page=2 → filters; anything unknown is dropped. */
export function filtersFrom(params: Params, collections: readonly string[]): LogFilters {
  const collection = first(params?.collection)
  const known = collection && collections.includes(collection) ? collection : null
  const doc = first(params?.doc)
  const admin = first(params?.admin)
  const kind = first(params?.kind)
  const page = Number(first(params?.page))
  return {
    collection: known,
    doc: known && doc && /^[\w-]{1,64}$/.test(doc) ? doc : null,
    admin: admin && /^\d{1,10}$/.test(admin) ? admin : null,
    kind: kind && (logKinds as readonly string[]).includes(kind) ? (kind as LogKind) : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The address of this page with some filters changed (null drops one); a new filter starts again at page 1. */
export function hrefWith(base: string, filters: LogFilters, change: Partial<LogFilters>): string {
  const next = { ...filters, ...('page' in change ? {} : { page: 1 }), ...change }
  const query = new URLSearchParams()
  if (next.collection) query.set('collection', next.collection)
  if (next.collection && next.doc) query.set('doc', next.doc)
  if (next.admin) query.set('admin', next.admin)
  if (next.kind) query.set('kind', next.kind)
  if (next.page > 1) query.set('page', String(next.page))
  const text = query.toString()
  return text ? `${base}?${text}` : base
}
