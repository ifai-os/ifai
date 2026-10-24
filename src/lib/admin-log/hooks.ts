import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterLoginHook,
  CollectionAfterOperationHook,
  CollectionBeforeOperationHook,
  CollectionConfig,
  CollectionSlug,
  Endpoint,
  Payload,
  PayloadRequest,
} from 'payload'

import {
  changedFields,
  collapseBulk,
  endpointAction,
  mergeEntry,
  safeBody,
  statusChanges,
  titleOf,
  type Entry,
} from './rules'
import { adminLog } from './schema'

/**
 * The back-office log (docs/specs/foundation.md「后台 · 操作记录」): hooks on every collection
 * record what a signed-in admin saved, created and deleted, and every POST endpoint the modules
 * add to a collection records its action once it succeeds. Jobs, scripts and readers' own requests
 * have no admin on the request and are not logged.
 */

type Actor = { id: number | null; email: string | null }

/** One admin request: the outermost write and the rows its saves add, written when it finishes. */
type Pending = { root: object; actor: Actor; entries: Map<string, Entry> }

const pendingByRequest = new WeakMap<PayloadRequest, Pending>()
/** Requests served by a module endpoint: that endpoint writes one row for the whole action. */
const endpointRequests = new WeakSet<PayloadRequest>()

const WRITES = new Set(['create', 'update', 'delete', 'restoreVersion'])

function adminOf(req: PayloadRequest): Actor | null {
  const user = req.user as { collection?: string; id?: unknown; email?: unknown } | null | undefined
  if (!user || user.collection !== 'admins') return null
  return { id: typeof user.id === 'number' ? user.id : Number(user.id) || null, email: typeof user.email === 'string' ? user.email : null }
}

/** Inside the save's transaction when there is one (a rolled-back save leaves no row), in a savepoint so a failed insert cannot break the save. */
async function write(payload: Payload, req: PayloadRequest | null, actor: Actor, entries: (Entry & { action?: string })[]): Promise<void> {
  if (!entries.length) return
  const adapter = payload.db as unknown as PostgresAdapter
  const transactionID = req ? await req.transactionID : undefined
  const db = (transactionID && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
  const rows = entries.map((entry) => ({
    adminId: actor.id,
    adminEmail: actor.email,
    kind: entry.kind,
    action: entry.action ?? null,
    collection: entry.collection,
    docId: entry.docId,
    docTitle: entry.docTitle,
    detail: Object.keys(entry.detail).length ? entry.detail : null,
  }))
  try {
    await db.transaction(async (tx) => {
      await tx.insert(adminLog).values(rows)
    })
  } catch (error) {
    console.error('admin log not written:', error instanceof Error ? error.message : error)
  }
}

function localizedFields(collection: { flattenedFields?: { name: string; localized?: boolean }[] }): Set<string> {
  return new Set((collection.flattenedFields ?? []).filter((field) => field.localized).map((field) => field.name))
}

function add(req: PayloadRequest, entry: Entry, actor: Actor): Promise<void> | void {
  const pending = pendingByRequest.get(req)
  if (!pending) return write(req.payload, req, actor, [entry])
  const key = `${entry.collection}:${entry.docId}`
  pending.entries.set(key, mergeEntry(pending.entries.get(key), entry))
}

const beforeOperation: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (!WRITES.has(operation) || pendingByRequest.has(req) || endpointRequests.has(req)) return
  const actor = adminOf(req)
  if (actor) pendingByRequest.set(req, { root: args, actor, entries: new Map() })
}

const afterOperation: CollectionAfterOperationHook = async ({ args, req, result }) => {
  const pending = pendingByRequest.get(req)
  if (pending && pending.root === args) {
    pendingByRequest.delete(req)
    await write(req.payload, req, pending.actor, collapseBulk([...pending.entries.values()]))
  }
  return result
}

const afterChange: CollectionAfterChangeHook = async ({ collection, doc, previousDoc, operation, req }) => {
  if (endpointRequests.has(req)) return doc
  let actor = pendingByRequest.get(req)?.actor ?? adminOf(req)
  // The first admin is created on the first visit to /admin, before anyone is signed in.
  if (!actor && collection.slug === 'admins' && operation === 'create' && !req.user) {
    actor = { id: doc.id, email: doc.email ?? null }
  }
  if (!actor) return doc
  const fields = operation === 'update' ? changedFields(previousDoc, doc) : []
  const status = operation === 'update' ? statusChanges(previousDoc, doc) : []
  if (operation === 'update' && !fields.length) return doc
  const localized = localizedFields(collection)
  const writesLocale = typeof req.locale === 'string' && req.locale !== 'all' && (operation === 'create' ? localized.size > 0 : fields.some((field) => localized.has(field)))
  await add(
    req,
    {
      kind: operation,
      collection: collection.slug,
      docId: String(doc.id),
      docTitle: titleOf(doc, collection.admin?.useAsTitle),
      detail: {
        ...(fields.length ? { fields } : {}),
        ...(status.length ? { status } : {}),
        ...(writesLocale ? { locales: [req.locale as string] } : {}),
      },
    },
    actor,
  )
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ collection, doc, id, req }) => {
  if (endpointRequests.has(req)) return doc
  const actor = pendingByRequest.get(req)?.actor ?? adminOf(req)
  if (!actor) return doc
  await add(req, { kind: 'delete', collection: collection.slug, docId: String(id), docTitle: titleOf(doc, collection.admin?.useAsTitle), detail: {} }, actor)
  return doc
}

const afterLogin: CollectionAfterLoginHook = async ({ collection, req, user }) => {
  const actor = { id: user.id, email: user.email ?? null }
  await write(req.payload, null, actor, [
    { kind: 'login', collection: collection.slug, docId: String(user.id), docTitle: titleOf(user, collection.admin?.useAsTitle), detail: {} },
  ])
  return user
}

type BodyRequest = PayloadRequest & { text?: () => Promise<string> }

/** Let the handler read the body as usual (as JSON or text) and the log read it again afterwards. */
function keepBody(req: BodyRequest): () => Promise<Record<string, unknown>> {
  const original = req.text?.bind(req)
  let text: Promise<string> | undefined
  const readText = () => (text ??= original ? original() : Promise.resolve(''))
  req.text = readText
  req.json = async () => JSON.parse(await readText())
  return async () => {
    try {
      const body: unknown = JSON.parse(await readText())
      return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
}

async function titleFor(payload: Payload, collection: CollectionConfig, id: string | undefined): Promise<string | null> {
  if (!id || !collection.admin?.useAsTitle) return null
  try {
    const doc = await payload.findByID({ collection: collection.slug as CollectionSlug, id, depth: 0, locale: 'zh-Hans', disableErrors: true, overrideAccess: true })
    return titleOf(doc as Record<string, unknown> | null, collection.admin.useAsTitle)
  } catch {
    return null
  }
}

function wrapEndpoint(collection: CollectionConfig, endpoint: Endpoint): Endpoint {
  if (endpoint.method === 'get') return endpoint
  const handler = endpoint.handler
  return {
    ...endpoint,
    custom: { ...endpoint.custom, adminLog: true },
    handler: async (req) => {
      endpointRequests.add(req)
      const readBody = keepBody(req)
      const response = await handler(req)
      const actor = response.ok ? adminOf(req) : null
      if (actor) {
        try {
          const body = await readBody()
          const described = endpointAction(collection.slug, endpoint.path, req.routeParams, body)
          if (described) {
            const id = req.routeParams?.id === undefined ? undefined : String(req.routeParams.id)
            await write(req.payload, null, actor, [
              {
                kind: 'action',
                action: described.action,
                collection: collection.slug,
                docId: id ?? null,
                docTitle: await titleFor(req.payload, collection, id),
                detail: { ...(Object.keys(described.params).length ? { params: described.params } : {}), ...safeBody(body) },
              },
            ])
          }
        } catch (error) {
          console.error('admin log not written:', error instanceof Error ? error.message : error)
        }
      }
      return response
    },
  }
}

/** Every collection with the log's hooks, and its POST endpoints wrapped. */
export function withAdminLog(collections: CollectionConfig[]): CollectionConfig[] {
  return collections.map((collection) => ({
    ...collection,
    hooks: {
      ...collection.hooks,
      beforeOperation: [...(collection.hooks?.beforeOperation ?? []), beforeOperation],
      afterChange: [...(collection.hooks?.afterChange ?? []), afterChange],
      afterDelete: [...(collection.hooks?.afterDelete ?? []), afterDelete],
      afterOperation: [...(collection.hooks?.afterOperation ?? []), afterOperation],
      ...(collection.auth ? { afterLogin: [...(collection.hooks?.afterLogin ?? []), afterLogin] } : {}),
    },
    ...(Array.isArray(collection.endpoints) ? { endpoints: collection.endpoints.map((endpoint) => wrapEndpoint(collection, endpoint)) } : {}),
  }))
}
