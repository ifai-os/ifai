import { createTranslator } from 'next-intl'

import { localizePath, messagesFileName, type Locale } from '@/i18n/config'
import { emailHtml, emailText, type EmailContent } from '@/lib/email/layout'
import { siteUrl } from '@/lib/site-url'

import type { SubmissionStatus } from './rules'

export type SubmissionEmailInput = {
  status: SubmissionStatus
  code: string
  /** The name as it was submitted. */
  name: string
  locale: Locale
  /** Listed or already listed: the published app, for the button to its page. */
  app?: { slug: string; name: string } | null
  /** The owner's words to the submitter (the「给提交人的说明」field). */
  reply?: string | null
}

export type SubmissionEmail = { subject: string; html: string; text: string }

/**
 * The email for a submission's status, in the language of the page it was sent from: received
 * (pending), listed, already listed (duplicate) or not listed.
 */
export async function buildSubmissionEmail(input: SubmissionEmailInput): Promise<SubmissionEmail> {
  const { status, code, name, locale, app } = input
  const messages = (await import(`../../../../messages/${messagesFileName(locale)}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'appSubmissions.email' })
  const reply = input.reply?.trim()
  const quote = reply ? { caption: t('reply'), text: reply } : undefined
  const footer = t('footer', { code })
  const button = app ? { label: t('button'), href: `${siteUrl()}${localizePath(locale, `/apps/${app.slug}`)}` } : undefined

  let subject: string
  let content: EmailContent
  if (status === 'accepted') {
    const listedName = app?.name ?? name
    subject = t('acceptedSubject', { name: listedName, code })
    content = { locale, heading: t('acceptedHeading', { name: listedName }), paragraphs: [t('acceptedBody', { name: listedName })], quote, button, footer }
  } else if (status === 'duplicate') {
    subject = t('duplicateSubject', { code })
    content = { locale, heading: t('duplicateHeading'), paragraphs: [t('duplicateBody', { name: app?.name ?? name })], quote, button, footer }
  } else if (status === 'rejected') {
    subject = t('rejectedSubject', { code })
    content = { locale, heading: t('rejectedHeading'), paragraphs: [t('rejectedBody', { name })], quote, footer }
  } else {
    subject = t('receivedSubject', { code })
    content = { locale, heading: t('receivedHeading'), paragraphs: [t('receivedBody', { name })], footer }
  }
  return { subject, html: emailHtml(content), text: emailText(content) }
}
