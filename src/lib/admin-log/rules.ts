/**
 * What goes into a back-office log row (docs/specs/foundation.md「后台 · 操作记录」), as pure
 * functions: which fields a save changed, a status going from one value to another, what is safe
 * to keep from an endpoint's body, and the name of the endpoint's action.
 */

export type StatusChange = { field: string; from: string | null; to: string | null }

export type LogDetail = {
  /** Fields a save changed (top-level names only, never their values). */
  fields?: string[]
  status?: StatusChange[]
  /** Content languages the save wrote. */
  locales?: string[]
  /** For deleting or updating many at once from the list: how many documents. */
  count?: number
  /** For an endpoint: the route's other parameters, e.g. { reviewId: "8" }. */
  params?: Record<string, string>
  /** For an endpoint: short, enum-like body values (booleans, numbers, ids, codes). */
  body?: Record<string, unknown>
  /** For an endpoint: body fields that were sent but not kept (text, objects). */
  omitted?: string[]
}

export type LogKind = 'create' | 'update' | 'delete' | 'login' | 'action'

/** Bookkeeping fields every save touches. */
const IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt'])
const STATUS_FIELDS = ['_status', 'status']
const TITLE_MAX = 120
const SHORT_VALUE = /^[\w.:-]{1,64}$/
const LIST_MAX = 50

/**
 * A related document read with depth is compared as its id. Array and block rows are compared
 * without their row id: writing a row back (as the traditional Chinese sync does) gives it a new one.
 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('id' in record && ('createdAt' in record || 'updatedAt' in record)) return record.id
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => key !== 'id')
        .sort()
        .map((key) => [key, normalize(record[key])]),
    )
  }
  return value ?? null
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

/** Top-level fields whose value differs between the document before and after a save. */
export function changedFields(previous: Record<string, unknown> | null | undefined, doc: Record<string, unknown>): string[] {
  const before = previous ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(doc)])
  return [...keys].filter((key) => !IGNORED_FIELDS.has(key) && !same(before[key], doc[key])).sort()
}

function shortText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' && value.length <= 40 ? value : null
}

/** A status (or Payload's draft `_status`) that changed, as from → to. */
export function statusChanges(previous: Record<string, unknown> | null | undefined, doc: Record<string, unknown>): StatusChange[] {
  return STATUS_FIELDS.flatMap((field) => {
    const from = previous?.[field]
    const to = doc[field]
    if (same(from, to)) return []
    if ((from != null && shortText(from) === null) || (to != null && shortText(to) === null)) return []
    return [{ field, from: shortText(from), to: shortText(to) }]
  })
}

/** The document's title as the admin list shows it, cut to a reasonable length. */
export function titleOf(doc: Record<string, unknown> | null | undefined, useAsTitle: string | undefined): string | null {
  const value = useAsTitle ? doc?.[useAsTitle] : undefined
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!text) return null
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text
}

function keepable(value: unknown): boolean {
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return SHORT_VALUE.test(value)
  return false
}

/**
 * The parts of an endpoint's JSON body that are safe and useful to keep: booleans, numbers and
 * short codes (`{ status: 'hidden' }`, `{ into: 12 }`, `{ resolve: [3, 4] }`). Text a person wrote,
 * pasted lists and objects are left out and only named in `omitted`.
 */
export function safeBody(body: unknown): Pick<LogDetail, 'body' | 'omitted'> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  const kept: Record<string, unknown> = {}
  const omitted: string[] = []
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined || value === null) continue
    if (keepable(value)) kept[key] = value
    else if (Array.isArray(value) && value.length <= LIST_MAX && value.every(keepable)) kept[key] = value
    else omitted.push(key)
  }
  return {
    ...(Object.keys(kept).length ? { body: kept } : {}),
    ...(omitted.length ? { omitted: omitted.sort() } : {}),
  }
}

/**
 * The name of an endpoint's action, from its path: `:id` dropped, `:action` replaced by its value,
 * other parameters kept aside. Some endpoints do different things by body, so those add the body's
 * choice: `app-submissions:handling/draft`, `apps:reviews/hidden`, `apps:reports/delist`.
 * Null for endpoints that write nothing (a test fetch, an AI suggestion).
 */
export function endpointAction(
  collection: string,
  path: string,
  routeParams: Record<string, unknown> | undefined,
  body: Record<string, unknown>,
): { action: string; params: Record<string, string> } | null {
  const params: Record<string, string> = {}
  const segments: string[] = []
  for (const segment of path.split('/').filter(Boolean)) {
    if (!segment.startsWith(':')) {
      segments.push(segment)
      continue
    }
    const name = segment.slice(1)
    const value = routeParams?.[name]
    if (name === 'id') continue
    if (name === 'action') segments.push(String(value ?? ''))
    else if (value !== undefined) params[name] = String(value)
  }
  const choice = bodyChoice(`${collection}:${segments.join('/')}`, body)
  if (choice) segments.push(choice)
  const action = `${collection}:${segments.join('/')}`
  return SILENT_ACTIONS.has(action) ? null : { action, params }
}

/** Endpoints that only read or suggest; nothing to log. */
const SILENT_ACTIONS = new Set(['sources:test-fetch', 'stories:review/assist'])

function bodyChoice(action: string, body: Record<string, unknown>): string | null {
  switch (action) {
    case 'app-submissions:handling':
      return typeof body.action === 'string' && SHORT_VALUE.test(body.action) ? body.action : null
    case 'apps:reviews':
      if (body.translate === true) return 'translate'
      if (body.keep === true) return 'keep'
      return typeof body.status === 'string' && SHORT_VALUE.test(body.status) ? body.status : null
    case 'apps:reports':
      return body.delist === true ? 'delist' : 'resolve'
    case 'apps:mentions':
      return body.removed === true ? 'remove' : body.removed === false ? 'restore' : null
    case 'circles:posts':
      if (body.keep === true) return 'keep'
      return typeof body.status === 'string' && SHORT_VALUE.test(body.status) ? body.status : null
    default:
      return null
  }
}

/** One log row before it is written. */
export type Entry = {
  kind: LogKind
  collection: string
  docId: string | null
  docTitle: string | null
  detail: LogDetail
}

const KIND_WEIGHT: Record<LogKind, number> = { update: 0, create: 1, delete: 2, login: 3, action: 3 }

/**
 * One save can write the same document more than once (the traditional Chinese text is written
 * back right after the simplified one): those become one row, with every field and language
 * they changed. Creating then updating stays a create; anything then deleted is a delete.
 */
export function mergeEntry(into: Entry | undefined, next: Entry): Entry {
  if (!into) return next
  const kind = KIND_WEIGHT[next.kind] >= KIND_WEIGHT[into.kind] ? next.kind : into.kind
  const fields = [...new Set([...(into.detail.fields ?? []), ...(next.detail.fields ?? [])])].sort()
  const locales = [...new Set([...(into.detail.locales ?? []), ...(next.detail.locales ?? [])])].sort()
  const status = [...(into.detail.status ?? [])]
  for (const change of next.detail.status ?? []) {
    const existing = status.findIndex((item) => item.field === change.field)
    if (existing === -1) status.push(change)
    else status[existing] = { field: change.field, from: status[existing].from, to: change.to }
  }
  const detail: LogDetail = {
    ...(kind !== 'create' && fields.length ? { fields } : {}),
    ...(status.some((item) => item.from !== item.to) ? { status: status.filter((item) => item.from !== item.to) } : {}),
    ...(locales.length ? { locales } : {}),
  }
  return { ...into, kind, docTitle: next.docTitle ?? into.docTitle, detail }
}

/**
 * Deleting or updating a hundred documents from the list is one row per document; past this many
 * they become one row per collection with the count, so the log stays readable.
 */
export const BULK_ROWS = 20

export function collapseBulk(entries: Entry[]): Entry[] {
  if (entries.length <= BULK_ROWS) return entries
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.collection}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0]
    const fields = [...new Set(group.flatMap((entry) => entry.detail.fields ?? []))].sort()
    return {
      kind: group[0].kind,
      collection: group[0].collection,
      docId: null,
      docTitle: null,
      detail: { count: group.length, ...(fields.length ? { fields } : {}) },
    }
  })
}
