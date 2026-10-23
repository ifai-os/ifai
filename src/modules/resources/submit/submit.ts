import type { Payload } from 'payload'

import { defaultLocale, isLocale } from '@/i18n/config'
import { emailDeliveryConfigured } from '@/lib/auth/providers'
import { isFieldError } from '@/lib/field-error'

import type { SkillSubmission } from '@/payload-types'

import { shanghaiDayStart } from '../normalize'
import { buildSubmissionEmail } from './email'
import { submissionRules, type SubmissionInput } from './rules'

/** `submittedAt` is when that submission was made: the earlier one when the same repository was sent again. */
export type SubmitOutcome = { ok: true; code: string; email: string; submittedAt: string } | { ok: false; error: 'daily-limit' }

/** Two submissions in the same instant can pick the same number; the unique index turns one away. */
const isTakenCode = (error: unknown) => isFieldError(error, 'code')

/**
 * A member sends a Skill (POST /api/resources/submissions). The same repository sent again while
 * it still waits gives back that submission rather than a second one; otherwise a member can
 * send `submissionRules.dailyLimit` a Shanghai day. The collection's hook then queues the
 * "received" email.
 */
export async function submitSkill(payload: Payload, input: SubmissionInput, userId: string, now = new Date()): Promise<SubmitOutcome> {
  const waiting = await payload.find({
    collection: 'skill-submissions',
    where: { submitterId: { equals: userId }, repository: { equals: input.repository }, status: { equals: 'pending' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const existing = waiting.docs[0]
  if (existing?.code) return { ok: true, code: existing.code, email: existing.email, submittedAt: existing.createdAt }

  const today = await payload.count({
    collection: 'skill-submissions',
    where: { submitterId: { equals: userId }, createdAt: { greater_than_equal: shanghaiDayStart(now).toISOString() } },
    overrideAccess: true,
  })
  if (today.totalDocs >= submissionRules.dailyLimit) return { ok: false, error: 'daily-limit' }

  const data = { ...input, submitterId: userId, status: 'pending' as const }
  const create = () => payload.create({ collection: 'skill-submissions', data, depth: 0, overrideAccess: true })
  const created = await create().catch((error: unknown) => {
    if (isTakenCode(error)) return create()
    throw error
  })
  return { ok: true, code: created.code ?? '', email: created.email, submittedAt: created.createdAt }
}

/** "SKILL.md:3 — message" for each thing the scan flagged in the Skill's newest version, if that scan blocked it. */
async function blockedFindings(payload: Payload, skillId: number): Promise<string[]> {
  const { docs } = await payload.find({
    collection: 'skill-versions',
    where: { skill: { equals: skillId } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const newest = docs[0]
  if (newest?.scanStatus !== 'blocked') return []
  return [...(newest.findings ?? [])]
    .sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high'))
    .map(({ file, line, message }) => (file ? `${file}${line ? `:${line}` : ''} — ${message}` : message))
}

/**
 * Emails the submitter about the submission's current status, unless they already have that
 * email. → the status they were told about, or null when nothing was sent. In production
 * without Resend nothing is sent and the submission stays "not told", so a later save can retry.
 */
export async function emailSubmitter(payload: Payload, id: number): Promise<SkillSubmission['status'] | null> {
  const submission = await payload.findByID({ collection: 'skill-submissions', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!submission?.code || submission.status === submission.notifiedStatus) return null
  if (!emailDeliveryConfigured() && process.env.NODE_ENV === 'production') {
    payload.logger.warn(`Skill submission ${submission.code}: email delivery is not configured (RESEND_API_KEY, EMAIL_FROM); the submitter was not told.`)
    return null
  }

  const skillId = typeof submission.skill === 'object' ? submission.skill?.id : submission.skill
  const skill = skillId
    ? await payload.findByID({ collection: 'skills', id: skillId, depth: 0, overrideAccess: true, disableErrors: true })
    : null
  const message = await buildSubmissionEmail({
    status: submission.status,
    code: submission.code,
    repository: submission.repository,
    locale: isLocale(submission.locale) ? submission.locale : defaultLocale,
    skillSlug: skill?.status === 'published' ? skill.slug : null,
    reply: submission.status === 'pending' ? null : submission.reply,
    findings: submission.status === 'rejected' && skill ? await blockedFindings(payload, skill.id) : [],
  })
  await payload.sendEmail({ to: submission.email, subject: message.subject, html: message.html, text: message.text })
  return submission.status
}

/**
 * Records which email the submitter has, so a retry or another save does not send it twice.
 * Straight through the adapter: bookkeeping, not an edit, so no hooks and no checks.
 */
export async function markNotified(payload: Payload, id: number, status: SkillSubmission['status'], now = new Date()): Promise<void> {
  await payload.db.updateOne({
    collection: 'skill-submissions',
    id,
    data: { notifiedStatus: status, notifiedAt: now.toISOString() },
    returning: false,
  })
}

/** Submissions changed in the last week whose submitter has not had the email for their status: the sweep's list. */
export async function submissionsToNotify(payload: Payload, now = new Date()): Promise<number[]> {
  const { docs } = await payload.find({
    collection: 'skill-submissions',
    where: { updatedAt: { greater_than_equal: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() } },
    select: { status: true, notifiedStatus: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return docs.filter((doc) => doc.status !== doc.notifiedStatus).map((doc) => doc.id)
}
