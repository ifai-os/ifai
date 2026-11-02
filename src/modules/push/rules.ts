import { createHash, timingSafeEqual } from 'node:crypto'

import { cleanWebsite } from '@/modules/apps/profile/import'
import { domainFromUrl } from '@/modules/apps/normalize'
import { MAX_AGE_MS } from '@/modules/daily/intake'
import { normalizeUrl, siteOf } from '@/modules/daily/url'

/**
 * 浏览器推送 (docs/specs/push.md): the owner's browser extension sends the page being read into the
 * collection pipeline. Pure rules here; the database work is in ./news.ts and ./apps.ts.
 */

export const pushKinds = ['news', 'app'] as const
export type PushKind = (typeof pushKinds)[number]

export type NewsPush = {
  kind: 'news'
  /** Normalized like every collected link (../daily/url.ts), so the unique index on raw_items.url dedupes it. */
  url: string
  site: string
  title: string
  summary: string | null
  /** The page's own published time, when it gave one. */
  publishedAt: Date | null
  /** The page's og:site_name, used to name a new source for this site. */
  siteName: string | null
}

export type AppPush = {
  kind: 'app'
  /** The site's home page: apps are one per domain (../apps/profile/import.ts). */
  website: string
  domain: string
  /** Empty when unknown: the profile draft names the app. */
  name: string
}

export type Push = NewsPush | AppPush
export type Parsed = { ok: true; push: Push } | { ok: false; error: string }

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean ? clean.slice(0, max) : null
}

function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Common suffixes on page titles ("Cursor - The AI Code Editor", "Claude | Anthropic"): the app's
 * name is the first part. Only used when the page has no og:site_name.
 */
export function appNameFromTitle(title: string | null): string {
  if (!title) return ''
  const first = title.split(/\s+[|·•–—-]\s+|:\s+/)[0]?.trim() ?? ''
  return first.length >= 2 && first.length <= 40 ? first : ''
}

/** The request body → what to push, or why it cannot be. */
export function parsePush(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send JSON: { "kind": "news" | "app", "url": "…" }' }
  const input = body as Record<string, unknown>
  const kind = input.kind
  if (kind !== 'news' && kind !== 'app') return { ok: false, error: '"kind" must be "news" or "app".' }
  if (typeof input.url !== 'string') return { ok: false, error: '"url" is required.' }

  if (kind === 'news') {
    const url = normalizeUrl(input.url)
    const site = url && siteOf(url)
    if (!url || !site) return { ok: false, error: 'Not a web address.' }
    if (new URL(url).pathname === '/' && !new URL(url).search) return { ok: false, error: 'This is a home page, not an article.' }
    return {
      ok: true,
      push: {
        kind,
        url,
        site,
        title: text(input.title, 300) ?? url,
        summary: text(input.summary, 1000),
        publishedAt: dateOf(input.publishedAt),
        siteName: text(input.siteName, 80),
      },
    }
  }

  const cleaned = cleanWebsite(input.url)
  const domain = cleaned && domainFromUrl(cleaned)
  if (!cleaned || !domain) return { ok: false, error: 'Not a web address.' }
  const website = new URL(cleaned).origin
  const name = text(input.name, 80) ?? appNameFromTitle(text(input.title, 300))
  return { ok: true, push: { kind, website, domain, name } }
}

/** Like the collection rules (../daily/intake.ts): a report published over 48 hours ago is only kept on record. */
export function pushedStatus(publishedAt: Date | null, now: Date): 'fresh' | 'archived' {
  return publishedAt && now.getTime() - publishedAt.getTime() > MAX_AGE_MS ? 'archived' : 'fresh'
}

/** `Authorization: Bearer $PUSH_TOKEN`, compared in constant time. */
export function tokenMatches(authorization: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const token = env.PUSH_TOKEN?.trim()
  const given = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token || !given) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(given), digest(token))
}

/** A source (feed or list page) belongs to a site when its address or home page is on it. */
export function sourceOnSite(source: { url: string; homepage?: string | null }, site: string): boolean {
  return siteOf(source.url) === site || (!!source.homepage && siteOf(source.homepage) === site)
}
