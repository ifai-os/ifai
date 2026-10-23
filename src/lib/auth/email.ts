import { createTranslator } from 'next-intl'

import { defaultLocale, localeFromPathSegment, messagesFileName, type Locale } from '@/i18n/config'
import { emailDeliveryConfigured } from '@/lib/auth/providers'
import { emailHtml, emailText } from '@/lib/email/layout'

/** The magic-link URL carries callbackURL=/zh-hans/…; its first segment decides the email language. */
export function localeFromMagicLink(url: string): Locale {
  try {
    const callback = new URL(url).searchParams.get('callbackURL') ?? ''
    const path = /^https?:\/\//.test(callback) ? new URL(callback).pathname : callback
    return localeFromPathSegment(path.split('/')[1]) ?? defaultLocale
  } catch {
    return defaultLocale
  }
}

type MagicLinkEmail = {
  locale: Locale
  subject: string
  html: string
  text: string
}

export async function buildMagicLinkEmail(url: string): Promise<MagicLinkEmail> {
  const locale = localeFromMagicLink(url)
  const messages = (await import(`../../../messages/${messagesFileName(locale)}.json`)).default
  const t = createTranslator({ locale, messages, namespace: 'email' })
  const content = {
    locale,
    heading: t('heading'),
    paragraphs: [t('body')],
    button: { label: t('button'), href: url },
    footer: t('ignore'),
  }
  return { locale, subject: t('subject'), html: emailHtml(content), text: emailText(content) }
}

/** Sends the sign-in link with Resend. Without Resend configured (local dev), prints the link instead. */
export async function sendMagicLinkEmail({ email, url }: { email: string; url: string }): Promise<void> {
  const message = await buildMagicLinkEmail(url)

  if (!emailDeliveryConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email delivery is not configured: set RESEND_API_KEY and EMAIL_FROM.')
    }
    console.info(`\n[auth] Magic link for ${email} (${message.locale}):\n${url}\n`)
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`)
  }
}
