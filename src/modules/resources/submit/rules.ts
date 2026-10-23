import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { cleanText, textLength } from '@/modules/apps/reviews/rules'

import { parseRepositoryUrl } from '../import/github'

/**
 * Skill submissions (docs/specs/resources.md, rule 12): the limits and input checks shared by the
 * submit form and its API. No server imports, so the form uses this file too.
 */
export const submissionRules = {
  /** Characters (code points) in the one-line note. */
  maxNote: 200,
  /** Submissions a member can send per Shanghai day. */
  dailyLimit: 5,
} as const

/** Inngest event: a submission was listed or turned down, so its submitter gets an email. */
export const submissionNotifyEvent = 'skill/submission-notify'

export type SubmissionInput = { repository: string; note: string; email: string; locale: Locale }
export type SubmissionField = 'repository' | 'note' | 'email'

// Payload's own check for email fields (payload/dist/fields/validations.js), so the form and the collection agree.
const emailPattern =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

/**
 * A GitHub address as the owner will import it: https://github.com/owner/repo, plus
 * /tree/<ref>/<folder> when one was given. A link to the SKILL.md file itself points at its folder.
 * Copied from the address bar works too: no https://, ?tab=readme-ov-file, #readme.
 * Anything that is not a GitHub repository → null.
 */
export function normalizeRepository(value: string): string | null {
  const address = value.trim().replace(/[?#].*$/, '')
  const ref = parseRepositoryUrl(/^(?:www\.)?github\.com\//i.test(address) ? `https://${address}` : address)
  if (!ref) return null
  const base = `https://github.com/${ref.owner}/${ref.repo}`
  if (!ref.ref) return base
  const folder = (ref.subdir ?? '').replace(/(^|\/)SKILL\.md$/i, '')
  const path = folder ? `/${folder.split('/').map(encodeSegment).join('/')}` : ''
  return `${base}/tree/${encodeSegment(ref.ref)}${path}`
}

/** One path segment, encoded once whether or not the address arrived encoded. */
function encodeSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment))
  } catch {
    return encodeURIComponent(segment)
  }
}

/** POST /api/resources/submissions { repository, note, email, locale }: the fields that are not right, or the tidied input. */
export function parseSubmissionInput(input: unknown): { ok: true; value: SubmissionInput } | { ok: false; fields: SubmissionField[] } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const repository = typeof fields.repository === 'string' ? normalizeRepository(fields.repository) : null
  const note = typeof fields.note === 'string' ? cleanText(fields.note).replace(/\s+/gu, ' ') : ''
  const email = typeof fields.email === 'string' ? fields.email.trim() : ''
  const wrong: SubmissionField[] = []
  if (!repository) wrong.push('repository')
  if (!note || textLength(note) > submissionRules.maxNote) wrong.push('note')
  if (!emailPattern.test(email) || email.length > 254) wrong.push('email')
  if (!repository || wrong.length > 0) return { ok: false, fields: wrong }
  return { ok: true, value: { repository, note, email, locale: isLocale(fields.locale) ? fields.locale : defaultLocale } }
}
