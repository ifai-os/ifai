// The config first: collections reach it through the database helpers, so loading one first would be circular.
import config from '@payload-config'
import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { filtersFrom, hrefWith } from '@/admin/admin-log/rules'
import { logText } from '@/admin/admin-log/text'
import {
  BULK_ROWS,
  changedFields,
  collapseBulk,
  endpointAction,
  mergeEntry,
  safeBody,
  statusChanges,
  titleOf,
  type Entry,
} from '@/lib/admin-log/rules'

describe('admin log: what a save changed', () => {
  it('lists changed top-level fields, not bookkeeping ones', () => {
    const before = { id: 1, name: 'Kite', tagline: 'old', updatedAt: 'a', tags: ['x'] }
    const after = { id: 1, name: 'Kite', tagline: 'new', updatedAt: 'b', tags: ['x', 'y'] }
    expect(changedFields(before, after)).toEqual(['tagline', 'tags'])
  })

  it('compares a related document read with depth as its id', () => {
    const before = { category: 3 }
    const after = { category: { id: 3, name: 'Coding', updatedAt: 'x' } }
    expect(changedFields(before, after)).toEqual([])
    expect(changedFields(before, { category: { id: 4, updatedAt: 'x' } })).toEqual(['category'])
  })

  it('ignores new row ids when array rows are written back unchanged', () => {
    const before = { features: [{ id: 'a1', title: 'Explain' }] }
    expect(changedFields(before, { features: [{ id: 'b2', title: 'Explain' }] })).toEqual([])
    expect(changedFields(before, { features: [{ id: 'a1', title: 'Fix' }] })).toEqual(['features'])
  })

  it('treats missing and null as the same, and ignores key order in objects', () => {
    expect(changedFields({ note: null }, {})).toEqual([])
    expect(changedFields({ profile: { a: 1, b: 2 } }, { profile: { b: 2, a: 1 } })).toEqual([])
  })

  it('keeps a status as from → to, but not long values', () => {
    expect(statusChanges({ status: 'draft' }, { status: 'published' })).toEqual([{ field: 'status', from: 'draft', to: 'published' }])
    expect(statusChanges({ _status: 'draft', status: 'a' }, { _status: 'published', status: 'a' })).toEqual([
      { field: '_status', from: 'draft', to: 'published' },
    ])
    expect(statusChanges({}, { status: 'pending' })).toEqual([{ field: 'status', from: null, to: 'pending' }])
    expect(statusChanges({ status: 'x' }, { status: 'y'.repeat(41) })).toEqual([])
  })

  it('takes the title the admin list uses, cut to 120 characters', () => {
    expect(titleOf({ name: '  Kite  ' }, 'name')).toBe('Kite')
    expect(titleOf({ name: '' }, 'name')).toBeNull()
    expect(titleOf({ name: 'x' }, undefined)).toBeNull()
    expect(titleOf({ name: 'a'.repeat(200) }, 'name')).toHaveLength(120)
  })
})

describe('admin log: endpoint bodies and actions', () => {
  it('keeps booleans, numbers, codes and id lists; names the rest', () => {
    expect(safeBody({ status: 'hidden', into: 12, keep: true, resolve: [3, 4], edits: { title: 'x' }, text: 'a\nb', note: 'a sentence with spaces' })).toEqual({
      body: { status: 'hidden', into: 12, keep: true, resolve: [3, 4] },
      omitted: ['edits', 'note', 'text'],
    })
    expect(safeBody({ email: 'me@example.com' })).toEqual({ omitted: ['email'] })
    expect(safeBody(null)).toEqual({})
    expect(safeBody([1, 2])).toEqual({})
  })

  it('names an action by its path and, where the body decides, by the body', () => {
    expect(endpointAction('stories', '/:id/review/:action', { id: '5', action: 'publish' }, {})).toEqual({ action: 'stories:review/publish', params: {} })
    expect(endpointAction('apps', '/:id/reviews/:reviewId', { id: '5', reviewId: '8' }, { status: 'hidden' })).toEqual({
      action: 'apps:reviews/hidden',
      params: { reviewId: '8' },
    })
    expect(endpointAction('apps', '/:id/reviews/:reviewId', { id: '5', reviewId: '8' }, { keep: true })?.action).toBe('apps:reviews/keep')
    expect(endpointAction('apps', '/:id/reviews/:reviewId', { id: '5', reviewId: '8' }, { translate: true })?.action).toBe('apps:reviews/translate')
    expect(endpointAction('apps', '/:id/reports', { id: '5' }, { delist: true })?.action).toBe('apps:reports/delist')
    expect(endpointAction('apps', '/:id/reports', { id: '5' }, { resolve: 'all' })?.action).toBe('apps:reports/resolve')
    expect(endpointAction('apps', '/:id/mentions/:mentionId', { id: '5', mentionId: '2' }, { removed: false })?.action).toBe('apps:mentions/restore')
    expect(endpointAction('app-submissions', '/:id/handling', { id: '5' }, { action: 'duplicate' })?.action).toBe('app-submissions:handling/duplicate')
    expect(endpointAction('circles', '/:id/posts/:postId', { id: '2', postId: '9' }, { status: 'hidden' })).toEqual({
      action: 'circles:posts/hidden',
      params: { postId: '9' },
    })
    expect(endpointAction('circles', '/:id/posts/:postId', { id: '2', postId: '9' }, { keep: true })?.action).toBe('circles:posts/keep')
    expect(endpointAction('circles', '/:id/comments/:commentId', { id: '2', commentId: '31' }, { status: 'hidden' })).toEqual({
      action: 'circles:comments/hidden',
      params: { commentId: '31' },
    })
    expect(endpointAction('circles', '/:id/comments/:commentId', { id: '2', commentId: '31' }, { keep: true })?.action).toBe('circles:comments/keep')
    // A reported member: dealt with (any of the three), or kept.
    expect(endpointAction('circles', '/member-reports/:userId', { userId: 'member-7' }, { resetHandle: true, resetName: true })).toEqual({
      action: 'circles:member-reports/handle',
      params: { userId: 'member-7' },
    })
    expect(endpointAction('circles', '/member-reports/:userId', { userId: 'member-7' }, { keep: true })?.action).toBe('circles:member-reports/keep')
  })

  it('logs nothing for endpoints that write nothing', () => {
    expect(endpointAction('sources', '/:id/test-fetch', { id: '1' }, {})).toBeNull()
    expect(endpointAction('stories', '/:id/review/:action', { id: '1', action: 'assist' }, { kind: 'shorter' })).toBeNull()
  })

  it('has a name in both admin languages for every POST endpoint the modules add', async () => {
    const collections: CollectionConfig[] = (await config).collections
    const bodies: Record<string, Record<string, unknown>[]> = {
      'apps:/:id/reviews/:reviewId': [{ status: 'hidden' }, { status: 'shown' }, { keep: true }, { translate: true }],
      'apps:/:id/reports': [{ delist: true }, { resolve: 'all' }],
      'apps:/:id/mentions/:mentionId': [{ removed: true }, { removed: false }],
      'app-submissions:/:id/handling': [{ action: 'draft' }, { action: 'duplicate' }],
      'circles:/:id/posts/:postId': [{ status: 'hidden' }, { status: 'shown' }, { keep: true }],
      'circles:/:id/comments/:commentId': [{ status: 'hidden' }, { status: 'shown' }, { keep: true }],
      'circles:/member-reports/:userId': [{ clearProfile: true }, { keep: true }],
    }
    const reviewActions = ['edit', 'publish', 'correct', 'reject', 'later', 'withdraw', 'merge', 'keep-separate', 'rewrite']
    const actions: string[] = []
    for (const collection of collections) {
      for (const endpoint of Array.isArray(collection.endpoints) ? collection.endpoints : []) {
        // Payload's own REST endpoints are logged by the collection hooks instead.
        if (!endpoint.custom?.adminLog) continue
        const params = endpoint.path.includes(':action')
          ? reviewActions.map((action) => ({ id: '1', action, reviewId: '2', mentionId: '3' }))
          : [{ id: '1', reviewId: '2', mentionId: '3', postId: '4', commentId: '5' }]
        for (const routeParams of params) {
          for (const body of bodies[`${collection.slug}:${endpoint.path}`] ?? [{}]) {
            const described = endpointAction(collection.slug, endpoint.path, routeParams, body)
            if (described) actions.push(described.action)
          }
        }
      }
    }
    expect(actions.length).toBeGreaterThan(20)
    for (const language of ['zh', 'en']) {
      const missing = actions.filter((action) => !logText(language).actions[action])
      expect(missing, language).toEqual([])
    }
  })
})

const entry = (change: Partial<Entry> & Pick<Entry, 'kind'>): Entry => ({ collection: 'stories', docId: '1', docTitle: 'A', detail: {}, ...change })

describe('admin log: one row per document per save', () => {
  it('merges the traditional Chinese write-back into the save', () => {
    const first = entry({ kind: 'update', detail: { fields: ['title'], locales: ['zh-Hans'], status: [{ field: 'status', from: 'queued', to: 'published' }] } })
    const second = entry({ kind: 'update', detail: { fields: ['summary', 'title'], locales: ['zh-Hant'] } })
    expect(mergeEntry(first, second).detail).toEqual({
      fields: ['summary', 'title'],
      status: [{ field: 'status', from: 'queued', to: 'published' }],
      locales: ['zh-Hans', 'zh-Hant'],
    })
  })

  it('keeps a create a create, and a status that went back where it started is dropped', () => {
    const created = mergeEntry(entry({ kind: 'create', detail: { locales: ['en'] } }), entry({ kind: 'update', detail: { fields: ['slug'] } }))
    expect(created.kind).toBe('create')
    expect(created.detail).toEqual({ locales: ['en'] })
    const back = mergeEntry(
      entry({ kind: 'update', detail: { status: [{ field: 'status', from: 'a', to: 'b' }] } }),
      entry({ kind: 'update', detail: { status: [{ field: 'status', from: 'b', to: 'a' }] } }),
    )
    expect(back.detail.status).toBeUndefined()
  })

  it('folds a big bulk change into one row per collection', () => {
    const few = Array.from({ length: BULK_ROWS }, (_, index) => entry({ kind: 'delete', docId: String(index) }))
    expect(collapseBulk(few)).toHaveLength(BULK_ROWS)
    const many = Array.from({ length: BULK_ROWS + 5 }, (_, index) => entry({ kind: 'update', docId: String(index), detail: { fields: ['status'] } }))
    expect(collapseBulk(many)).toEqual([{ kind: 'update', collection: 'stories', docId: null, docTitle: null, detail: { count: BULK_ROWS + 5, fields: ['status'] } }])
  })
})

describe('admin log page: filters', () => {
  const slugs = ['apps', 'stories']

  it('keeps known filters and drops the rest', () => {
    expect(filtersFrom({ collection: 'apps', doc: '12', admin: '3', kind: 'delete', page: '2' }, slugs)).toEqual({
      collection: 'apps',
      doc: '12',
      admin: '3',
      kind: 'delete',
      page: 2,
    })
    expect(filtersFrom({ collection: 'users', doc: '12', admin: 'x', kind: 'drop', page: '0' }, slugs)).toEqual({
      collection: null,
      doc: null,
      admin: null,
      kind: null,
      page: 1,
    })
    expect(filtersFrom(undefined, slugs).page).toBe(1)
  })

  it('builds addresses that start a new filter on page 1', () => {
    const filters = filtersFrom({ collection: 'apps', doc: '12', page: '3' }, slugs)
    expect(hrefWith('/admin/admin-log', filters, { page: 4 })).toBe('/admin/admin-log?collection=apps&doc=12&page=4')
    expect(hrefWith('/admin/admin-log', filters, { doc: null })).toBe('/admin/admin-log?collection=apps')
    expect(hrefWith('/admin/admin-log', filters, { collection: null, doc: null })).toBe('/admin/admin-log')
  })
})
