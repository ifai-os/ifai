import { defaultLocale, localizePath } from '@/i18n/config'

import type { KeyProblem } from './data'
import { agentRules, isKey } from './rules'

/**
 * How the open API and MCP answer a key that does not work or a caller over the limit
 * (docs/specs/agents.md rules 4 and 7), in the open API's error shape. No server imports.
 */

/** The key in an Authorization header; null when the header is not `Bearer ifai_…`. */
export function bearerKey(header: string): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim())
  return match && isKey(match[1]) ? match[1] : null
}

/** Where a member makes keys, for the messages agents relay to them. */
export function settingsUrl(origin: string): string {
  return `${origin}${localizePath(defaultLocale, '/me/account?section=agents')}`
}

const problemText: Record<KeyProblem | 'malformed', (settings: string) => string> = {
  malformed: () => 'Send your IFAI key as `Authorization: Bearer ifai_…`, or no Authorization header to read without one.',
  unknown: (settings) => `This IFAI key does not work: it was deleted, or it was never one. Ask your user for a new key from ${settings}.`,
  expired: (settings) => `This IFAI key has expired. Ask your user for a new key from ${settings}.`,
  disabled: (settings) => `IFAI has turned this agent off, so its keys do not work. Its owner can see why at ${settings}.`,
}

function headersFor(extra: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'WWW-Authenticate, Retry-After',
    'X-Robots-Tag': 'noindex',
    ...extra,
  }
}

/** An error_description may hold only printable ASCII other than `"` and a backslash (RFC 6750 §3); a header, nothing past Latin-1. */
function describeInHeader(text: string): string {
  return text.replace(/…/g, '...').replace(/[^\x20\x21\x23-\x5b\x5d-\x7e]/g, '')
}

/** 401 with the reason in the body and in WWW-Authenticate (RFC 6750). */
export function unauthorized(problem: KeyProblem | 'malformed' | 'missing', origin: string, message?: string): Response {
  const settings = settingsUrl(origin)
  const text = message ?? (problem === 'missing' ? `This needs an IFAI key. Ask your user for one from ${settings}.` : problemText[problem](settings))
  const error = problem === 'missing' ? null : problem === 'malformed' ? 'invalid_request' : 'invalid_token'
  const challenge = error ? `Bearer realm="IFAI", error="${error}", error_description="${describeInHeader(text)}"` : 'Bearer realm="IFAI"'
  return new Response(JSON.stringify({ error: { code: 'unauthorized', message: text } }), {
    status: 401,
    headers: headersFor({ 'WWW-Authenticate': challenge }),
  })
}

/** 429 with how long to wait. */
export function tooManyRequests(retryAfter: number): Response {
  const message = `Too many requests: up to ${agentRules.perMinute} a minute. Try again in ${retryAfter} seconds.`
  return new Response(JSON.stringify({ error: { code: 'rate_limited', message } }), {
    status: 429,
    headers: headersFor({ 'Retry-After': String(retryAfter) }),
  })
}

