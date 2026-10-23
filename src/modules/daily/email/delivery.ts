import { dailyEmailEnabled } from '@/lib/switches'

/**
 * How the daily email leaves the site (docs/specs/daily-email.md rule 11 and「送达」): Resend,
 * from DAILY_EMAIL_FROM (news@ifai.io) under a sender name in the subscriber's language.
 * Deployed environments need both to show the subscribe boxes; locally, without them, emails
 * are printed to the terminal like sign-in links.
 */
type Env = Record<string, string | undefined>

/** The sending address alone; "IFAI <news@ifai.io>" is accepted too. */
export function dailyEmailFrom(env: Env = process.env): string | null {
  const value = env.DAILY_EMAIL_FROM?.trim()
  if (!value) return null
  return value.match(/<([^>]+)>/)?.[1]?.trim() || value
}

export function deliveryConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && dailyEmailFrom(env))
}

/** Vercel's production and preview deployments; everything else (local, CI) counts as development. */
export function isDeployed(env: Env = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview'
}

/** Whether the subscribe boxes show and the subscribe API takes new subscriptions. */
export function subscribingOpen(env: Env = process.env): boolean {
  return dailyEmailEnabled(env) && (deliveryConfigured(env) || !isDeployed(env))
}

export type OutgoingEmail = {
  to: string
  /** Display name for the From line, in the subscriber's language. */
  senderName: string
  subject: string
  html: string
  text: string
  /** List-Unsubscribe and List-Unsubscribe-Post (RFC 8058). */
  headers: Record<string, string>
  /** Resend tag naming the kind of email, for the delivery webhooks. Letters, digits, _ and - only. */
  kind: string
}

/** Sends one email through Resend and returns its id; prints it instead where Resend is not set up. */
export async function sendEmail(email: OutgoingEmail, env: Env = process.env): Promise<string | null> {
  const from = dailyEmailFrom(env)
  if (!env.RESEND_API_KEY || !from) {
    if (isDeployed(env)) throw new Error('Daily email is not configured: set RESEND_API_KEY and DAILY_EMAIL_FROM.')
    console.info(`\n[daily-email] ${email.kind} to ${email.to}: ${email.subject}\n\n${email.text}\n`)
    return null
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${email.senderName} <${from}>`,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      tags: [{ name: 'kind', value: email.kind }],
    }),
  })
  if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`)
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null
  return typeof body?.id === 'string' ? body.id : null
}
