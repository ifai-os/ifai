import { Resolver } from 'node:dns/promises'

/**
 * Whether a domain can take mail (docs/specs/daily-email.md rule 2): it has an MX record, or
 * failing that an A or AAAA record (RFC 5321's fallback). A null MX ("0 .", RFC 7505) says it
 * takes none. Only clear answers turn an address down: a timeout or a failing resolver gives
 * 'unknown', and the subscription goes ahead.
 */
export type MailDomain = 'ok' | 'no-mail' | 'unknown'

export type MailLookup = {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>
  resolve4(domain: string): Promise<string[]>
  resolve6(domain: string): Promise<string[]>
}

/** Answers that mean "no such record" rather than "could not ask". */
const NO_RECORD = new Set(['ENODATA', 'ENOTFOUND'])

type Answer<T> = { records: T[] } | { missing: string } | { failed: true }

async function ask<T>(lookup: () => Promise<T[]>): Promise<Answer<T>> {
  try {
    return { records: await lookup() }
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    return typeof code === 'string' && NO_RECORD.has(code) ? { missing: code } : { failed: true }
  }
}

const has = <T>(answer: Answer<T>) => 'records' in answer && answer.records.length > 0

/** A domain that certainly takes mail: if the resolver says it does not exist either, the resolver is what is broken. */
const CANARY = 'gmail.com'
let canary: { works: boolean; until: number } | null = null

async function resolverWorks(lookup: MailLookup, now: number): Promise<boolean> {
  if (canary && canary.until > now) return canary.works
  const works = has(await ask(() => lookup.resolveMx(CANARY)))
  canary = { works, until: now + (works ? 10 : 1) * 60_000 }
  return works
}

export async function checkMailDomain(domain: string, lookup: MailLookup = defaultLookup(), now = Date.now()): Promise<MailDomain> {
  const mx = await ask(() => lookup.resolveMx(domain))
  if ('failed' in mx) return 'unknown'
  if ('records' in mx && mx.records.length > 0) {
    return mx.records.some((record) => record.exchange !== '' && record.exchange !== '.') ? 'ok' : 'no-mail'
  }
  for (const fallback of [() => lookup.resolve4(domain), () => lookup.resolve6(domain)]) {
    const answer = await ask(fallback)
    if ('failed' in answer) return 'unknown'
    if (has(answer)) return 'ok'
  }
  // "No such domain" from a resolver that cannot find anything (a sandbox without DNS) is not an answer.
  if ('missing' in mx && mx.missing === 'ENOTFOUND' && !(await resolverWorks(lookup, now))) return 'unknown'
  return 'no-mail'
}

/** A short-fused resolver, so a slow name server cannot hold up the subscribe box. */
function defaultLookup(): MailLookup {
  return new Resolver({ timeout: 2_000, tries: 1 })
}

/** checkMailDomain with an overall deadline. */
export async function domainTakesMail(domain: string, deadline = 4_000): Promise<MailDomain> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<MailDomain>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), deadline)
  })
  try {
    return await Promise.race([checkMailDomain(domain), late])
  } finally {
    clearTimeout(timer)
  }
}

/** Tests reset the remembered canary answer between cases. */
export function forgetResolverCheck() {
  canary = null
}
