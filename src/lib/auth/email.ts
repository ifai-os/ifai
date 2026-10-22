import { createTranslator } from 'next-intl'

import { defaultLocale, localeFromPathSegment, messagesFileName, type Locale } from '@/i18n/config'
import { emailDeliveryConfigured } from '@/lib/auth/providers'

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  const href = escapeHtml(url)

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:32px 16px;background:#F7F7F9;font-family:-apple-system,system-ui,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans','Apple SD Gothic Neo',sans-serif;color:#000000">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px">
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:600">${escapeHtml(t('heading'))}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#48494C">${escapeHtml(t('body'))}</p>
        <a href="${href}" style="display:inline-block;padding:12px 24px;border-radius:6px;background:#000000;color:#FFFFFF;font-size:15px;font-weight:500;text-decoration:none">${escapeHtml(t('button'))}</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6F7174">${escapeHtml(t('ignore'))}</p>
      </td></tr>
    </table>
  </body>
</html>`

  const text = `${t('heading')}\n\n${t('body')}\n\n${url}\n\n${t('ignore')}\n`

  return { locale, subject: t('subject'), html, text }
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
