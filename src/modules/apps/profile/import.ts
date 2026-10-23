import type { Payload } from 'payload'

import { domainFromUrl, isHttpUrl, reservedAppSlugs, slugify } from '../normalize'
import type { DraftInfo } from './state'

/**
 * 首批导入 (docs/specs/apps.md「后台」): the owner pastes a list of apps, one per line, as
 * "Name, https://website" or just the website. Each new website becomes a draft app waiting
 * for its profile draft. Only the name and the website are taken from the list.
 */

export const MAX_IMPORT_LINES = 300

export type ImportEntry = {
  line: number
  /** Empty when the line had only the website; the app is then named after its domain until the draft names it. */
  name: string
  website: string
  domain: string
  /** The main category, when it is known: a submitted app's (../submissions/admin.ts). */
  category?: number | null
}

export type ImportProblem = {
  line: number
  text: string
  reason: 'no-website' | 'duplicate' | 'too-many' | 'invalid'
  /** For a duplicate: the line it repeats. */
  firstLine?: number
  /** For a save that failed: Payload's message. */
  detail?: string
}

const URL_PATTERN = /https?:\/\/[^\s,，;；|<>"'`]+/i
const DOMAIN_PATTERN = /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?$/i
const MARKDOWN_LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i

/** Referral and campaign parameters added by directories and ads; never part of an app's address. */
const TRACKING_PARAMS = /^(?:utm_\w+|ref|ref_src|referrer|source|via|aff|affiliate|fpr|gclid|fbclid|mc_cid|mc_eid)$/i

/** Strip trailing punctuation, the fragment and tracking parameters; null when it is not a web address. */
export function cleanWebsite(raw: string): string | null {
  const trimmed = raw.trim().replace(/[).,;:!?。，；：、」』）]+$/u, '')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  if (!isHttpUrl(withScheme)) return null
  const url = new URL(withScheme)
  if (!url.hostname.includes('.')) return null
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
  }
  const value = url.toString()
  // "https://kitecode.example/" → "https://kitecode.example": the bare origin reads better.
  return url.pathname === '/' && !url.search ? value.replace(/\/$/, '') : value
}

function nameFrom(rest: string): string {
  return rest
    .replace(/^[\s,，;；|:：\-–—•*]+|[\s,，;；|:：\-–—•*]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
}

/** One pasted line → name and website, or null when the line has no website. */
export function parseImportLine(text: string): { name: string; website: string } | null {
  const line = text.trim()
  const markdown = MARKDOWN_LINK.exec(line)
  if (markdown) {
    const website = cleanWebsite(markdown[2])
    return website ? { name: nameFrom(markdown[1]), website } : null
  }

  const url = URL_PATTERN.exec(line)
  if (url) {
    const website = cleanWebsite(url[0])
    return website ? { name: nameFrom(line.slice(0, url.index) + ' ' + line.slice(url.index + url[0].length)), website } : null
  }

  // No scheme: the last part that looks like a domain is the website ("Character.AI character.ai").
  const parts = line.split(/[\s,，;；|\t]+/).filter(Boolean)
  for (let index = parts.length - 1; index >= 0; index--) {
    if (!DOMAIN_PATTERN.test(parts[index])) continue
    const website = cleanWebsite(parts[index])
    if (website) return { name: nameFrom(parts.filter((_, other) => other !== index).join(' ')), website }
  }
  return null
}

/** The pasted text → entries to import and lines that were left out. Empty lines and "#" comments are skipped. */
export function parseImportList(text: string): { entries: ImportEntry[]; problems: ImportProblem[] } {
  const entries: ImportEntry[] = []
  const problems: ImportProblem[] = []
  const seen = new Map<string, number>()
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const value = raw.trim()
    if (!value || value.startsWith('#')) return
    const parsed = parseImportLine(value)
    const domain = parsed ? domainFromUrl(parsed.website) : undefined
    if (!parsed || !domain) {
      problems.push({ line, text: value.slice(0, 200), reason: 'no-website' })
      return
    }
    const first = seen.get(domain)
    if (first !== undefined) {
      problems.push({ line, text: value.slice(0, 200), reason: 'duplicate', firstLine: first })
      return
    }
    if (entries.length >= MAX_IMPORT_LINES) {
      problems.push({ line, text: value.slice(0, 200), reason: 'too-many' })
      return
    }
    seen.set(domain, line)
    entries.push({ line, ...parsed, domain })
  })
  return { entries, problems }
}

export type ImportResult = {
  created: { line: number; id: number; name: string; website: string }[]
  existing: { line: number; id: number; name: string; website: string }[]
  problems: ImportProblem[]
}

async function freeSlug(payload: Payload, base: string): Promise<string> {
  const start = reservedAppSlugs.includes(base) ? `${base}-app` : base
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? start : `${start.slice(0, 60)}-${n}`
    const { totalDocs } = await payload.count({ collection: 'apps', where: { slug: { equals: slug } } })
    if (totalDocs === 0) return slug
  }
  return `${start.slice(0, 50)}-${Date.now()}`
}

/**
 * Create a draft app for every website that is not in the directory yet (matched by domain), each
 * waiting for its profile draft. Existing apps are reported, never changed.
 */
export async function importApps(payload: Payload, entries: ImportEntry[], now: Date = new Date()): Promise<ImportResult> {
  const result: ImportResult = { created: [], existing: [], problems: [] }
  if (entries.length === 0) return result

  const { docs } = await payload.find({
    collection: 'apps',
    where: { domain: { in: entries.map((entry) => entry.domain) } },
    pagination: false,
    depth: 0,
    select: { name: true, domain: true, website: true },
  })
  const byDomain = new Map(docs.map((doc) => [doc.domain, doc]))

  for (const entry of entries) {
    const existing = byDomain.get(entry.domain)
    if (existing) {
      result.existing.push({ line: entry.line, id: existing.id, name: existing.name, website: existing.website })
      continue
    }
    const name = entry.name || entry.domain
    const info: DraftInfo = { requestedAt: now.toISOString(), ...(entry.name ? {} : { nameFromDomain: true }) }
    try {
      const slug = await freeSlug(payload, slugify(name) || slugify(entry.domain) || 'app')
      const app = await payload.create({
        collection: 'apps',
        data: {
          name,
          slug,
          website: entry.website,
          ...(entry.category ? { primaryCategory: entry.category } : {}),
          status: 'draft',
          draftStatus: 'pending',
          draftInfo: info,
        },
        depth: 0,
      })
      result.created.push({ line: entry.line, id: app.id, name: app.name, website: app.website })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      result.problems.push({ line: entry.line, text: `${entry.name} ${entry.website}`.trim(), reason: 'invalid', detail: detail.slice(0, 300) })
    }
  }
  return result
}
