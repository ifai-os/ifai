import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

import { keepingRequest } from '@/lib/i18n/hant-sync'

import type { App, AppSubmission } from '@/payload-types'

import { queueDrafts, type Queued } from '../profile/endpoints'
import { importApps } from '../profile/import'
import type { SubmissionStatus } from './rules'

/**
 * The back office's side of submissions (docs/specs/apps.md 5e): the「处理」panel's state and its
 * two actions, and the hook that marks submissions listed when their app goes live.
 */

export type HandlingApp = { id: number; name: string; slug: string; status: App['status']; draftStatus: App['draftStatus'] }

export type HandlingState = {
  status: SubmissionStatus
  /** The app linked to the submission: its draft, or the app it repeats. */
  linked: HandlingApp | null
  /** Other apps on the submission's domain, published first. */
  sameDomain: HandlingApp[]
}

const appFields = { name: true, slug: true, status: true, draftStatus: true } as const

function handlingApp(app: Pick<App, 'id' | 'name' | 'slug' | 'status' | 'draftStatus'>): HandlingApp {
  return { id: app.id, name: app.name, slug: app.slug, status: app.status, draftStatus: app.draftStatus ?? null }
}

function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  return value && typeof value === 'object' && 'id' in value && typeof value.id === 'number' ? value.id : null
}

async function appsOnDomain(payload: Payload, domain: string | null | undefined): Promise<HandlingApp[]> {
  if (!domain) return []
  const { docs } = await payload.find({
    collection: 'apps',
    where: { domain: { equals: domain } },
    select: appFields,
    limit: 10,
    depth: 0,
  })
  return docs.map(handlingApp).sort((a, b) => Number(b.status === 'published') - Number(a.status === 'published'))
}

/** What the「处理」panel shows for one submission; null when there is no such submission. */
export async function handlingState(payload: Payload, id: number): Promise<HandlingState | null> {
  const submission = await payload.findByID({ collection: 'app-submissions', id, depth: 0, disableErrors: true })
  if (!submission) return null
  const linkedId = relationId(submission.app)
  const [linked, sameDomain] = await Promise.all([
    linkedId ? payload.findByID({ collection: 'apps', id: linkedId, select: appFields, depth: 0, disableErrors: true }) : null,
    appsOnDomain(payload, submission.domain),
  ])
  return {
    status: submission.status,
    linked: linked ? handlingApp(linked) : null,
    sameDomain: sameDomain.filter((app) => app.id !== linkedId),
  }
}

export type HandlingResult =
  | { ok: true; appId: number; created: boolean; queued?: Queued }
  | { ok: false; error: 'not-found' | 'decided' | 'listed' | 'not-listed' | 'invalid'; detail?: string }

/** The submission, while it still waits for a decision. */
async function pendingSubmission(req: PayloadRequest, id: number): Promise<AppSubmission | 'not-found' | 'decided'> {
  const submission = await req.payload.findByID({ collection: 'app-submissions', id, depth: 0, disableErrors: true, req })
  if (!submission) return 'not-found'
  return submission.status === 'pending' ? submission : 'decided'
}

/**
 * 「收录：生成草稿」: a draft app from the submission's name, website and category, with its
 * profile draft started, linked to the submission. An unpublished app already on the domain is
 * linked instead. Once the linked app is published, `acceptOnPublish` marks the submission listed.
 */
export async function draftFromSubmission(req: PayloadRequest, id: number): Promise<HandlingResult> {
  const submission = await pendingSubmission(req, id)
  if (typeof submission === 'string') return { ok: false, error: submission }
  const linkedId = relationId(submission.app)
  if (linkedId) return { ok: true, appId: linkedId, created: false }

  const onDomain = await appsOnDomain(req.payload, submission.domain)
  if (onDomain.some((app) => app.status === 'published')) return { ok: false, error: 'listed' }
  let appId = onDomain[0]?.id
  let queued: Queued | undefined
  const create = !appId
  if (!appId) {
    const entry = {
      line: 1,
      name: submission.name,
      website: submission.website,
      domain: submission.domain ?? '',
      category: relationId(submission.category),
    }
    const { created, existing, problems } = await importApps(req.payload, [entry])
    appId = created[0]?.id ?? existing[0]?.id
    if (!appId) return { ok: false, error: 'invalid', detail: problems[0]?.detail }
    if (created[0]) queued = await queueDrafts([appId])
  }
  await req.payload.update({ collection: 'app-submissions', id, data: { app: appId }, depth: 0, req })
  return { ok: true, appId, created: create, queued }
}

/** 「标为重复」: the submission repeats the published app on its domain; the collection's hook emails the submitter. */
export async function markDuplicate(req: PayloadRequest, id: number): Promise<HandlingResult> {
  const submission = await pendingSubmission(req, id)
  if (typeof submission === 'string') return { ok: false, error: submission }
  const listed = (await appsOnDomain(req.payload, submission.domain)).find((app) => app.status === 'published')
  if (!listed) return { ok: false, error: 'not-listed' }
  await req.payload.update({ collection: 'app-submissions', id, data: { app: listed.id, status: 'duplicate' }, depth: 0, req })
  return { ok: true, appId: listed.id, created: false }
}

/**
 * On `apps`: an app made from submissions goes live, so the submissions waiting on it become
 * listed, and the hook on `app-submissions` emails each submitter.
 */
export const acceptOnPublish: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (doc.status !== 'published' || previousDoc?.status === 'published') return doc
  await keepingRequest(req, () =>
    req.payload.update({
      collection: 'app-submissions',
      where: { app: { equals: doc.id }, status: { equals: 'pending' } },
      data: { status: 'accepted' },
      depth: 0,
      req,
    }),
  )
  return doc
}
