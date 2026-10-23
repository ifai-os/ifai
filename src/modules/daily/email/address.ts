/**
 * Email addresses typed into the subscribe boxes (docs/specs/daily-email.md rules 1–2). Runs in
 * the browser too: the box checks the format and suggests a fix for a misspelled provider before
 * anything is sent; the server checks again and looks the domain up (./mail-domain.ts).
 */

/** Dots that CJK keyboards type in place of ".": "gmail。com". */
const WIDE_DOTS = /[。．｡]/g

/**
 * Lowercase, without surrounding spaces, with full-width characters folded (NFKC turns
 * "ｎａｍｅ＠ｇｍａｉｌ．ｃｏｍ" into ASCII) and an international domain in its ASCII form.
 */
export function normalizeEmail(value: string): string {
  const folded = value.normalize('NFKC').trim().toLowerCase()
  const at = folded.lastIndexOf('@')
  if (at < 0) return folded
  let domain = folded
    .slice(at + 1)
    .replace(WIDE_DOTS, '.')
    .replace(/\.$/, '')
  if (/[^\x00-\x7f]/.test(domain)) {
    try {
      domain = new URL(`http://${domain}`).hostname
    } catch {
      // Not a domain at all; the format check turns it down.
    }
  }
  return `${folded.slice(0, at)}@${domain}`
}

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const TOP_LEVEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

/** Whether a normalized address looks deliverable: a plain ASCII mailbox at a domain with a real top level. */
export function isEmailAddress(email: string): boolean {
  if (email.length > 254) return false
  const at = email.lastIndexOf('@')
  if (at < 1) return false
  const local = email.slice(0, at)
  const labels = email.slice(at + 1).split('.')
  return (
    local.length <= 64 &&
    LOCAL_PART.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    TOP_LEVEL.test(labels[labels.length - 1])
  )
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1)
}

/** Mail providers readers in our five languages use most; a near miss of one is likely a typo. */
const PROVIDERS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.jp',
  'yahoo.com.tw',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'zoho.com',
  'fastmail.com',
  'yandex.com',
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'yeah.net',
  'sina.com',
  'sina.cn',
  'sohu.com',
  'aliyun.com',
  '139.com',
  'hinet.net',
  'msa.hinet.net',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'kakao.com',
  'nate.com',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'nifty.com',
  'ocn.ne.jp',
]

/** Real domains close to a provider above, so they are not "corrected" into it. */
const LOOKALIKES = ['live.cn', 'live.jp', 'gmx.net', 'web.de', 'mail.ru', 'tom.com', '21cn.com', 'vip.qq.com', 'vip.163.com', 'vip.126.com']

const KNOWN = new Set([...PROVIDERS, ...LOOKALIKES])

/** Top levels that do not exist but are one slip away from .com, .net or .org. */
const TOP_LEVEL_TYPOS: Record<string, string> = {
  con: 'com',
  cmo: 'com',
  ocm: 'com',
  comm: 'com',
  coom: 'com',
  vom: 'com',
  xom: 'com',
  cpm: 'com',
  clm: 'com',
  nte: 'net',
  nett: 'net',
  ogr: 'org',
}

/** Edits (insert, delete, replace, swap two neighbours) between two short strings. */
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }
  return rows[a.length][b.length]
}

export type EmailSuggestion = { address: string; domain: string }

/**
 * "name@gmial.com" → name@gmail.com: the provider one or two edits away (one for short domains),
 * or the same domain with .con / .cmo fixed. Null when the domain is a known provider or nothing
 * is close.
 */
export function suggestEmail(email: string): EmailSuggestion | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!domain || KNOWN.has(domain)) return null

  let best: { domain: string; distance: number } | null = null
  for (const provider of PROVIDERS) {
    if (Math.abs(provider.length - domain.length) > 2) continue
    const distance = editDistance(domain, provider)
    const allowed = provider.length <= 7 ? 1 : 2
    if (distance <= allowed && (!best || distance < best.distance)) best = { domain: provider, distance }
  }
  if (best) return { address: `${local}@${best.domain}`, domain: best.domain }

  const dot = domain.lastIndexOf('.')
  const fixed = dot > 0 ? TOP_LEVEL_TYPOS[domain.slice(dot + 1)] : undefined
  if (!fixed) return null
  const corrected = `${domain.slice(0, dot)}.${fixed}`
  return { address: `${local}@${corrected}`, domain: corrected }
}

/** "hawk@gmail.com" → "ha•••@gmail.com", for the manage page. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '•••'
  const local = email.slice(0, at)
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  return `${shown}•••${email.slice(at)}`
}
