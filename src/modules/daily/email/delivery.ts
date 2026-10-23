import { dailyEmailEnabled } from '@/lib/switches'

/**
 * How the daily email leaves the site (docs/specs/daily-email.md rule 11 and「送达」): Resend,
 * from DAILY_EMAIL_FROM (news@ifai.io) under a sender name in the subscriber's language.
 * Deployed environments need both to show the subscribe boxes; locally, without them, emails
 * are printed to the terminal like sign-in links.
 */
type Env = Record<string, string | undefined>

const resendApi = 'https://api.resend.com'

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

/**
 * The deployment an email left from, as a Resend tag. Production and preview share the Resend
 * account and so its webhooks: each environment handles only the emails it sent.
 */
export function deploymentEnv(env: Env = process.env): 'production' | 'preview' | 'development' {
  return env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview' ? env.VERCEL_ENV : 'development'
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
  /** More tags for the webhooks: which subscriber, which send. Same characters. */
  tags?: Record<string, string>
}

/** The quota headers of a Resend response: emails used today (free plan only, resets 00:00 UTC) and this month. */
export type ResendQuota = { daily: number | null; monthly: number | null }

export function readQuota(headers: Headers): ResendQuota | null {
  const read = (name: string) => {
    const value = headers.get(name)
    return value !== null && /^\d+$/.test(value.trim()) ? Number(value) : null
  }
  const quota = { daily: read('x-resend-daily-quota'), monthly: read('x-resend-monthly-quota') }
  return quota.daily === null && quota.monthly === null ? null : quota
}

/**
 * What a refusal means for the morning job:
 * - quota: the daily or monthly quota is used up; stop this round (the quota comes back, so it
 *   is not counted as a try)
 * - refused: the key or the domain is not allowed to send; stop this round
 * - rejected: Resend found this request invalid; give up on these emails
 * - conflict: the same idempotency key already sent other content, so these went out before
 * - busy: too many requests, or the same key still in progress; try again shortly
 * - retry: Resend or the network failed; try again
 */
export type ResendFailureKind = 'quota' | 'refused' | 'rejected' | 'conflict' | 'busy' | 'retry'

export function failureKind(status: number, code: string): ResendFailureKind {
  if (status === 429) return /quota/.test(code) ? 'quota' : 'busy'
  if (status === 409) return code === 'invalid_idempotent_request' ? 'conflict' : 'busy'
  if (status === 401 || status === 403) return 'refused'
  if (status >= 400 && status < 500) return 'rejected'
  return 'retry'
}

export class ResendError extends Error {
  readonly kind: ResendFailureKind

  constructor(
    readonly status: number,
    /** Resend's error name: daily_quota_exceeded, rate_limit_exceeded, validation_error … */
    readonly code: string,
    message: string,
    /** Seconds from Retry-After, when Resend gave one. */
    readonly retryAfter: number | null,
    readonly quota: ResendQuota | null,
  ) {
    super(`Resend responded ${status}${code ? ` ${code}` : ''}: ${message}`)
    this.name = 'ResendError'
    this.kind = failureKind(status, code)
  }
}

export type SentEmails = {
  /** Resend's ids, in the order the emails were given; null where nothing was sent (printed locally). */
  ids: (string | null)[]
  quota: ResendQuota | null
}

function payloadOf(email: OutgoingEmail, from: string, env: Env) {
  const tags = { kind: email.kind, env: deploymentEnv(env), ...email.tags }
  return {
    from: `${email.senderName} <${from}>`,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
    tags: Object.entries(tags).map(([name, value]) => ({ name, value })),
  }
}

async function post(path: string, body: unknown, env: Env, idempotencyKey?: string): Promise<{ data: unknown; quota: ResendQuota | null }> {
  const response = await fetch(`${resendApi}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
    },
    body: JSON.stringify(body),
  })
  const quota = readQuota(response.headers)
  const raw = await response.text()
  let data: unknown = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    // Not JSON (a proxy's error page): the text says what happened.
  }
  if (!response.ok) {
    const error = (data ?? {}) as { name?: unknown; message?: unknown }
    const retryAfter = Number(response.headers.get('retry-after'))
    throw new ResendError(
      response.status,
      typeof error.name === 'string' ? error.name : '',
      typeof error.message === 'string' ? error.message : raw.slice(0, 500),
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      quota,
    )
  }
  return { data, quota }
}

/** Where Resend is not set up: print locally, refuse on Vercel. */
function printInstead(emails: OutgoingEmail[], env: Env): SentEmails {
  if (isDeployed(env)) throw new Error('Daily email is not configured: set RESEND_API_KEY and DAILY_EMAIL_FROM.')
  for (const email of emails) console.info(`\n[daily-email] ${email.kind} to ${email.to}: ${email.subject}\n\n${email.text}\n`)
  return { ids: emails.map(() => null), quota: null }
}

/** Sends one email through Resend; prints it instead where Resend is not set up. Throws a ResendError when refused. */
export async function sendEmail(email: OutgoingEmail, env: Env = process.env): Promise<SentEmails> {
  const from = dailyEmailFrom(env)
  if (!env.RESEND_API_KEY || !from) return printInstead([email], env)
  const { data, quota } = await post('/emails', payloadOf(email, from, env), env)
  const id = (data as { id?: unknown } | null)?.id
  return { ids: [typeof id === 'string' ? id : null], quota }
}

/** Resend's batch endpoint takes up to 100 emails a request. */
export const BATCH_SIZE = 100

/**
 * Sends up to 100 emails in one request. The idempotency key makes a retry with the same key
 * and the same emails return the first answer instead of sending again (Resend keeps keys for
 * 24 hours). All or nothing: Resend checks the whole batch before sending any of it.
 */
export async function sendBatch(emails: OutgoingEmail[], idempotencyKey: string, env: Env = process.env): Promise<SentEmails> {
  if (emails.length > BATCH_SIZE) throw new Error(`A batch takes at most ${BATCH_SIZE} emails, not ${emails.length}.`)
  const from = dailyEmailFrom(env)
  if (!env.RESEND_API_KEY || !from) return printInstead(emails, env)
  const { data, quota } = await post(
    '/emails/batch',
    emails.map((email) => payloadOf(email, from, env)),
    env,
    idempotencyKey,
  )
  const sent = (data as { data?: unknown } | null)?.data
  const list = Array.isArray(sent) ? sent : []
  return {
    ids: emails.map((_, index) => {
      const id = (list[index] as { id?: unknown } | undefined)?.id
      return typeof id === 'string' ? id : null
    }),
    quota,
  }
}
