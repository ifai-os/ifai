import type { CollectionSlug, DataFromCollectionSlug, PayloadRequest } from 'payload'

import { rejectField } from '@/lib/field-error'
import { keepingRequest } from '@/lib/i18n/hant-sync'

import { adminMessage } from './shared'

/** Once a version is out, its content never changes (rule 2); only these statuses remain. */
export const FROZEN_STATUSES: ReadonlySet<string> = new Set(['published', 'deprecated', 'withdrawn'])

/** Writes made by the app itself (import log, zh-Hant copies, promotions) skip the owner-facing rules. */
export function isSystemWrite(req: PayloadRequest): boolean {
  const context = req.context as Record<string, unknown> | undefined
  return Boolean(context?.system || context?.skipHantSync)
}

/** Stop a save with a message on one field, in the admin language. */
export function reject(req: PayloadRequest, collection: string, path: string, message: { en: string; zh: string }): never {
  rejectField(collection, path, adminMessage(req, message))
}

/** A relationship value as stored (id), whether Payload gave us the id or the populated document. */
export function relationId(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return undefined
}

/**
 * Read one document from inside a hook, in the save's own transaction, without disturbing the
 * request it runs in (a nested local API call rewrites the request's locale, depth and context).
 * Missing or unreadable documents come back as null.
 */
export function peek<T extends CollectionSlug>(
  req: PayloadRequest,
  collection: T,
  id: number | string | undefined,
): Promise<DataFromCollectionSlug<T> | null> {
  if (id === undefined) return Promise.resolve(null)
  return keepingRequest(req, () =>
    req.payload.findByID({ collection, id, depth: 0, req }).catch(() => null),
  ) as Promise<DataFromCollectionSlug<T> | null>
}

/** A write the app makes from inside another save; the collection's owner-facing rules skip it. */
export function systemUpdate<T extends CollectionSlug>(
  req: PayloadRequest,
  collection: T,
  id: number | string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return keepingRequest(req, () =>
    req.payload.update({ collection, id, data: data as never, depth: 0, req, context: { system: true } }),
  )
}
