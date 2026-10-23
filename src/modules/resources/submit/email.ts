import { createTranslator } from 'next-intl'

import { localizePath, messagesFileName, type Locale } from '@/i18n/config'
import { emailHtml, emailText, type EmailContent } from '@/lib/email/layout'
import { siteUrl } from '@/lib/site-url'

import type { SkillSubmission } from '@/payload-types'

/** Lines of scan findings an email lists before "…and N more". */
const findingsShown = 10

export type SubmissionEmailInput = {
  status: SkillSubmission['status']
  code: string
  repository: string
  locale: Locale
  /** Listed: the published Skill's slug, for the button to its page. */
  skillSlug?: string | null
  /** The owner's words to the submitter (the「给投稿人的说明」field). */
  reply?: string | null
  /** Not listed because the scan blocked the import: "file:line — what was found". */
  findings?: string[]
}

export type SubmissionEmail = { subject: string; html: string; text: string }

/**
 * The email for a submission's status, in the language it was sent in: received (pending),
 * listed (accepted) or not listed (rejected). Files and line numbers of a blocked scan go only
 * here and in the back office (docs/specs/resources.md, «安全检测»).
 */
export async function buildSubmissionEmail(input: SubmissionEmailInput): Promise<SubmissionEmail> {
  const { status, code, repository, locale } = input
  const messages = (await import(`../../../../messages/${messagesFileName(locale)}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'resources.submit.email' })
  const reply = input.reply?.trim()
  const quote = reply ? { caption: t('reply'), text: reply } : undefined
  const footer = t('footer', { code })

  let subject: string
  let content: EmailContent
  if (status === 'accepted') {
    subject = t('acceptedSubject', { code })
    const href = input.skillSlug ? `${siteUrl()}${localizePath(locale, `/resources/skills/${input.skillSlug}`)}` : null
    content = {
      locale,
      heading: t('acceptedHeading'),
      paragraphs: [t('acceptedBody', { repository })],
      quote,
      button: href ? { label: t('acceptedButton'), href } : undefined,
      footer,
    }
  } else if (status === 'rejected') {
    subject = t('rejectedSubject', { code })
    const findings = input.findings ?? []
    const items = findings.slice(0, findingsShown)
    if (findings.length > findingsShown) items.push(t('findingsMore', { count: findings.length - findingsShown }))
    content = {
      locale,
      heading: t('rejectedHeading'),
      paragraphs: [t('rejectedBody', { repository })],
      quote,
      list: items.length ? { caption: t('findings'), items } : undefined,
      footer,
    }
  } else {
    subject = t('receivedSubject', { code })
    content = { locale, heading: t('receivedHeading'), paragraphs: [t('receivedBody', { repository })], footer }
  }
  return { subject, html: emailHtml(content), text: emailText(content) }
}
