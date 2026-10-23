import type { Payload } from 'payload'

import { defaultLocale, isLocale } from '@/i18n/config'
import { emailDeliveryConfigured } from '@/lib/auth/providers'

import type { AppSubmission } from '@/payload-types'

import { buildSubmissionEmail } from './email'

/**
 * Emails the submitter about the submission's current status, unless they already have that
 * email. → the status they were told about, or null when nothing was sent. In production
 * without Resend nothing is sent and the submission stays "not told", so a later save can retry.
 */
export async function emailSubmitter(payload: Payload, id: number): Promise<AppSubmission['status'] | null> {
  const submission = await payload.findByID({ collection: 'app-submissions', id, depth: 0, disableErrors: true })
  if (!submission?.code || submission.status === submission.notifiedStatus) return null
  if (!emailDeliveryConfigured() && process.env.NODE_ENV === 'production') {
    payload.logger.warn(`App submission ${submission.code}: email delivery is not configured (RESEND_API_KEY, EMAIL_FROM); the submitter was not told.`)
    return null
  }

  const appId = typeof submission.app === 'object' ? submission.app?.id : submission.app
  const app = appId ? await payload.findByID({ collection: 'apps', id: appId, depth: 0, disableErrors: true }) : null
  const message = await buildSubmissionEmail({
    status: submission.status,
    code: submission.code,
    name: submission.name,
    locale: isLocale(submission.locale) ? submission.locale : defaultLocale,
    app: app?.status === 'published' ? { slug: app.slug, name: app.name } : null,
    reply: submission.status === 'pending' ? null : submission.reply,
  })
  await payload.sendEmail({ to: submission.email, subject: message.subject, html: message.html, text: message.text })
  return submission.status
}

/**
 * Records which email the submitter has, so a retry or another save does not send it twice.
 * Straight through the adapter: bookkeeping, not an edit, so no hooks and no checks.
 */
export async function markNotified(payload: Payload, id: number, status: AppSubmission['status'], now = new Date()): Promise<void> {
  await payload.db.updateOne({
    collection: 'app-submissions',
    id,
    data: { notifiedStatus: status, notifiedAt: now.toISOString() },
    returning: false,
  })
}

/** Submissions changed in the last week whose submitter has not had the email for their status: the sweep's list. */
export async function submissionsToNotify(payload: Payload, now = new Date()): Promise<number[]> {
  const { docs } = await payload.find({
    collection: 'app-submissions',
    where: { updatedAt: { greater_than_equal: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() } },
    select: { status: true, notifiedStatus: true },
    pagination: false,
    depth: 0,
  })
  return docs.filter((doc) => doc.status !== doc.notifiedStatus).map((doc) => doc.id)
}
