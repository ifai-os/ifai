import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { shanghaiDate, shanghaiWorkingDaysAfter } from '@/lib/shanghai-day'
import { isEmailAddress, normalizeEmail } from '@/modules/daily/email/address'

import { domainFromUrl } from '../normalize'
import { cleanWebsite } from '../profile/import'
import { cleanLine, parseId, textLength } from '../reviews/rules'

/**
 * 提交应用 (docs/specs/apps.md「页面与路由」, 5e): the limits and input checks shared by the
 * submit form and its API. No server imports, so the form uses this file too.
 */
export const submissionRules = {
  /** Characters (code points) in the app's name. */
  maxName: 60,
  /** Characters in the optional one-line note. */
  maxNote: 200,
  /** Submissions a member can send per Shanghai day. */
  dailyLimit: 5,
  /** Working days the review usually takes, as the page and the emails promise. */
  reviewDays: 2,
  /** Submissions「我的提交」shows, newest first. */
  mineShown: 20,
} as const

export const submissionStatuses = ['pending', 'accepted', 'duplicate', 'rejected'] as const
export type SubmissionStatus = (typeof submissionStatuses)[number]

/** Inngest event: a submission is new or has a new status, so its submitter gets an email. */
export const submissionNotifyEvent = 'apps/submission-notify'

export type AppSubmissionInput = {
  website: string
  domain: string
  name: string
  category: number | null
  note: string
  email: string
  locale: Locale
}
export type AppSubmissionField = 'website' | 'name' | 'note' | 'email'

/** POST /api/app-submissions/new: what can go wrong besides the fields. */
export type AppSubmissionsError = 'cross-site' | 'sign-in' | 'invalid' | 'listed' | 'daily-limit'

// A real top level: "example.com", "例子.中国" (as xn--…), not an IP address or "localhost".
const hostPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

/**
 * The website as the directory stores it (tracking parameters dropped, as in「批量添加应用」) and
 * its domain, for spotting an app that is already listed; null when it is not a public website.
 * Without https:// works too.
 */
export function submittedWebsite(value: string): { website: string; domain: string } | null {
  if (value.length > 2000) return null
  const website = cleanWebsite(value)
  const domain = website ? domainFromUrl(website) : undefined
  return website && domain && hostPattern.test(domain) ? { website, domain } : null
}

/** "A-1021-07": the Shanghai month and day, then that day's number. */
export function submissionCode(date: Date, sequence: number): string {
  const [, month, day] = shanghaiDate(date).split('-')
  return `A-${month}${day}-${String(sequence).padStart(2, '0')}`
}

/**
 * The number after the highest one taken on that date. Codes have no year, so other years on the
 * same date count too; counting instead would reuse a number once a submission is deleted.
 */
export function nextSubmissionSequence(codes: (string | null | undefined)[]): number {
  const taken = codes.map((code) => Number(/^A-\d{4}-(\d+)$/.exec(code ?? '')?.[1] ?? 0))
  return Math.max(0, ...taken) + 1
}

/** `?name=` on the submit page, which a search with no match passes on: one line, cut to `maxName`. */
export function nameFromQuery(value: string | string[] | undefined): string {
  const first = (Array.isArray(value) ? value[0] : value) ?? ''
  return [...cleanLine(first)].slice(0, submissionRules.maxName).join('')
}

/** The day the review should be done by: an estimate, in Shanghai working days without public holidays. */
export function reviewDeadline(sentAt: Date): Date {
  return shanghaiWorkingDaysAfter(sentAt, submissionRules.reviewDays)
}

/** POST /api/app-submissions/new { website, name, category, note, email, locale }: the fields that are not right, or the tidied input. */
export function parseAppSubmissionInput(
  input: unknown,
): { ok: true; value: AppSubmissionInput } | { ok: false; fields: AppSubmissionField[] } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const site = typeof fields.website === 'string' ? submittedWebsite(fields.website) : null
  const name = typeof fields.name === 'string' ? cleanLine(fields.name) : ''
  const note = typeof fields.note === 'string' ? cleanLine(fields.note) : ''
  const email = typeof fields.email === 'string' ? normalizeEmail(fields.email) : ''
  const wrong: AppSubmissionField[] = []
  if (!site) wrong.push('website')
  if (!name || textLength(name) > submissionRules.maxName) wrong.push('name')
  if (textLength(note) > submissionRules.maxNote) wrong.push('note')
  if (!isEmailAddress(email)) wrong.push('email')
  if (!site || wrong.length > 0) return { ok: false, fields: wrong }
  return {
    ok: true,
    value: {
      ...site,
      name,
      category: parseId(fields.category),
      note,
      email,
      locale: isLocale(fields.locale) ? fields.locale : defaultLocale,
    },
  }
}
