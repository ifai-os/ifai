import type { Payload } from 'payload'

import { defaultLocale, type Locale } from '@/i18n/config'
import { shanghaiDayStart } from '@/lib/shanghai-day'

import { submissionRules, type AppSubmissionInput, type SubmissionStatus } from './rules'

/**
 * Members' submissions, for the API (src/app/api/app-submissions/new) and「我的提交」. Works on
 * the Payload instance it is given and stays free of the Payload config, like ../reports/data.ts.
 */

/** `submittedAt` is when that submission was made: the earlier one when the same website was sent again. */
export type SubmitOutcome =
  | { ok: true; code: string; email: string; submittedAt: string; name: string; category: number | null }
  | { ok: false; error: 'listed'; app: { slug: string; name: string } }
  | { ok: false; error: 'daily-limit' }

/**
 * Two submissions in the same instant can pick the same number; the unique index turns one away.
 * Read by its shape, not `instanceof ValidationError`: the production build loads `payload` once
 * for pages and once for routes, and the database adapter may throw the other copy's error.
 */
function isTakenCode(error: unknown): boolean {
  const problems = (error as { data?: { errors?: unknown } } | null)?.data?.errors
  return Array.isArray(problems) && problems.some((problem) => (problem as { path?: unknown } | null)?.path === 'code')
}

function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  return value && typeof value === 'object' && 'id' in value && typeof value.id === 'number' ? value.id : null
}

/**
 * A member submits an app. A website whose domain is already a published app is not taken: the
 * reader is sent to that app. The same domain sent again while it still waits gives back that
 * submission; otherwise a member can send `submissionRules.dailyLimit` a Shanghai day. The
 * collection's hook then queues the "received" email.
 */
export async function submitApp(payload: Payload, input: AppSubmissionInput, userId: string, now = new Date()): Promise<SubmitOutcome> {
  const listed = await payload.find({
    collection: 'apps',
    where: { domain: { equals: input.domain }, status: { equals: 'published' } },
    select: { slug: true, name: true },
    limit: 1,
    depth: 0,
  })
  const app = listed.docs[0]
  if (app) return { ok: false, error: 'listed', app: { slug: app.slug, name: app.name } }

  const waiting = await payload.find({
    collection: 'app-submissions',
    where: { submitterId: { equals: userId }, domain: { equals: input.domain }, status: { equals: 'pending' } },
    limit: 1,
    depth: 0,
  })
  const existing = waiting.docs[0]
  if (existing?.code) {
    return {
      ok: true,
      code: existing.code,
      email: existing.email,
      submittedAt: existing.createdAt,
      name: existing.name,
      category: relationId(existing.category),
    }
  }

  const today = await payload.count({
    collection: 'app-submissions',
    where: { submitterId: { equals: userId }, createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
  })
  if (today.totalDocs >= submissionRules.dailyLimit) return { ok: false, error: 'daily-limit' }

  // A category deleted since the page was loaded is left out rather than refused: it is optional.
  const category = input.category
    ? await payload.findByID({ collection: 'app-categories', id: input.category, depth: 0, disableErrors: true })
    : null
  const data = {
    name: input.name,
    website: input.website,
    domain: input.domain,
    category: category?.id ?? null,
    note: input.note || null,
    email: input.email,
    locale: input.locale,
    submitterId: userId,
    status: 'pending' as const,
  }
  const create = () => payload.create({ collection: 'app-submissions', data, depth: 0 })
  const created = await create().catch((error: unknown) => {
    if (isTakenCode(error)) return create()
    throw error
  })
  return {
    ok: true,
    code: created.code ?? '',
    email: created.email,
    submittedAt: created.createdAt,
    name: created.name,
    category: category?.id ?? null,
  }
}

export type MySubmission = {
  id: number
  code: string
  name: string
  domain: string
  status: SubmissionStatus
  submittedAt: string
  /** The language of the page it was sent from, which the emails and the owner's note are in. */
  locale: Locale
  /** Listed, or already listed: the app's page, while it is published. */
  app: { slug: string; name: string } | null
  /** The owner's note to the submitter, once there is a result. */
  reply: string | null
}

/** 「我的提交」: a member's latest submissions, newest first. */
export async function mySubmissions(payload: Payload, userId: string): Promise<MySubmission[]> {
  const { docs } = await payload.find({
    collection: 'app-submissions',
    where: { submitterId: { equals: userId } },
    sort: '-createdAt',
    limit: submissionRules.mineShown,
    depth: 1,
    select: { code: true, name: true, domain: true, status: true, locale: true, app: true, reply: true, createdAt: true },
    populate: { apps: { slug: true, name: true, status: true } },
  })
  return docs.map((doc) => {
    const linked = typeof doc.app === 'object' ? doc.app : null
    const decided = doc.status !== 'pending'
    return {
      id: doc.id,
      code: doc.code ?? '',
      name: doc.name,
      domain: doc.domain ?? '',
      status: doc.status,
      submittedAt: doc.createdAt,
      locale: doc.locale ?? defaultLocale,
      app:
        (doc.status === 'accepted' || doc.status === 'duplicate') && linked?.status === 'published'
          ? { slug: linked.slug, name: linked.name }
          : null,
      reply: decided ? doc.reply?.trim() || null : null,
    }
  })
}
