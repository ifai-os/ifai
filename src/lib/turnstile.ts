/**
 * Cloudflare Turnstile on the forms that make the site send email: the sign-in link and the Daily
 * subscribe box (docs/specs/security.md). Off unless both keys are set, so local development,
 * the smoke tests and previews without keys work as before.
 */

/** The request header the browser puts the token in (also what Better Auth's captcha plugin reads). */
export const TURNSTILE_HEADER = 'x-captcha-response'

/** The action each form's widget is rendered with; the server checks it so a token can't be reused elsewhere. */
export const turnstileActions = { signIn: 'sign-in', subscribe: 'subscribe' } as const
export type TurnstileAction = (typeof turnstileActions)[keyof typeof turnstileActions]

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** The secret, when Turnstile is on: both keys set (a secret without the site key would turn every request away). */
export function turnstileSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  return secret && siteKey ? secret : null
}

type Siteverify = { success?: boolean; action?: string; 'error-codes'?: string[] }

/**
 * Whether a token from the browser is a fresh pass for this action. A missing token, a refused
 * one, the wrong action or Cloudflare not answering in 5 seconds all count as no: the form tells
 * the reader to try again rather than letting the request through.
 */
export async function verifyTurnstile(input: {
  secret: string
  token: string | null
  action: TurnstileAction
  ip?: string
  fetcher?: typeof fetch
}): Promise<boolean> {
  const token = input.token?.trim()
  if (!token || token.length > 2048) return false
  try {
    const response = await (input.fetcher ?? fetch)(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: input.secret, response: token, ...(input.ip && { remoteip: input.ip }) }),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const result = (await response.json()) as Siteverify
    return result.success === true && result.action === input.action
  } catch {
    return false
  }
}
