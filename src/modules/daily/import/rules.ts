/**
 * Stories from the editors' own pipeline (docs/specs/daily.md「从本地流水线导入」): the JSON Lines
 * that `newscrawler export-stories` writes, one story per line, checked and shaped here. Pure
 * functions: ./import.ts stores them.
 */
import { storyCategories, type StoryCategory } from '../categories'
import type { SourceRole } from '../story-fields'
import { maxStoryTags, storyTags, type StoryTag } from '../tags'
import { normalizeUrl, siteOf } from '../url'
import { slugify } from '../write/slug'

/** The languages the pipeline writes; zh-Hant is converted from zh-Hans on save (AGENTS.md rule 4). */
export const importLocales = ['en', 'zh-Hans', 'ja', 'ko'] as const
export type ImportLocale = (typeof importLocales)[number]

export type ImportText = { title: string; summary: string; tryIt: string | null; body: string | null }

export type ImportSource = { name: string; role: SourceRole; url: string; publishedAt: string | null }

export type ImportStory = {
  /** The Feishu record the story came from: the same record updates the same story. */
  recordId: string
  month: string | null
  slug: string
  category: StoryCategory
  tags: StoryTag[]
  publishedAt: string
  score: number | null
  sources: ImportSource[]
  /** English is always there; a missing language falls back to English on the pages. */
  text: { en: ImportText } & Partial<Record<Exclude<ImportLocale, 'en'>, ImportText>>
}

export type ParsedLine = { ok: true; story: ImportStory } | { ok: false; error: string }

/** At most this many stories in one request, so it finishes well within a function's time. */
export const MAX_IMPORT_STORIES = 200

/** Hosts whose links are a discussion of the story, not a report of it. */
const discussionHosts = /(^|\.)(news\.ycombinator\.com|reddit\.com|x\.com|twitter\.com|threads\.net|bsky\.app)$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\r\n?/g, '\n').trim()
  return trimmed || null
}

function isoTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/** One language's text: a title and a summary at least, else none. */
function localeText(value: unknown): ImportText | null {
  if (!isRecord(value)) return null
  const title = text(value.title)
  const summary = text(value.summary)
  if (!title || !summary) return null
  return { title, summary, tryIt: text(value.tryIt), body: text(value.body) }
}

/**
 * The sources as the pages list them: the original first, discussion threads marked as such,
 * each address once. A source is a URL or { url, publisher?, title?, publishedAt? }; the
 * publisher defaults to the site's name.
 */
export function importSources(value: unknown): ImportSource[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const sources: ImportSource[] = []
  for (const raw of value) {
    const entry = typeof raw === 'string' ? { url: raw } : isRecord(raw) ? raw : null
    const url = typeof entry?.url === 'string' ? normalizeUrl(entry.url) : null
    if (!entry || !url || seen.has(url)) continue
    seen.add(url)
    const site = siteOf(url) ?? url
    const role: SourceRole = sources.length === 0 ? 'original' : discussionHosts.test(site) ? 'discussion' : 'report'
    sources.push({ name: text(entry.publisher) ?? text(entry.name) ?? site, role, url, publishedAt: isoTime(entry.publishedAt) })
  }
  return sources
}

/** The industry tags the site knows, each once, at most three. */
export function importTags(value: unknown): StoryTag[] {
  if (!Array.isArray(value)) return []
  const known = new Set<string>(storyTags)
  return [...new Set(value.filter((tag): tag is StoryTag => typeof tag === 'string' && known.has(tag)))].slice(0, maxStoryTags)
}

/** Check one exported story; the error says what is wrong in words the pipeline's log can show. */
export function parseImportStory(value: unknown): ParsedLine {
  if (!isRecord(value)) return { ok: false, error: 'not a JSON object' }
  const feishu = isRecord(value.feishu) ? value.feishu : {}
  const recordId = text(feishu.record_id)
  if (!recordId) return { ok: false, error: 'feishu.record_id is missing' }
  const category = storyCategories.find((key) => key === value.category)
  if (!category) return { ok: false, error: `category "${String(value.category)}" is not one of ${storyCategories.join(', ')}` }
  const publishedAt = isoTime(value.publishedAt)
  if (!publishedAt) return { ok: false, error: 'publishedAt is missing or not a date' }
  const locales = isRecord(value.locales) ? value.locales : {}
  const en = localeText(locales.en)
  if (!en) return { ok: false, error: 'locales.en needs a title and a summary' }
  const sources = importSources(value.sources)
  if (!sources.length) return { ok: false, error: 'sources has no valid http(s) address' }

  const story: ImportStory = {
    recordId,
    month: text(feishu.month),
    slug: slugify(typeof value.slug === 'string' ? value.slug : '') || slugify(en.title) || `story-${slugify(recordId) || 'imported'}`,
    category,
    tags: importTags(value.tags),
    publishedAt,
    score: typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : null,
    sources,
    text: { en },
  }
  for (const locale of importLocales) {
    if (locale === 'en') continue
    const localized = localeText(locales[locale])
    if (localized) story.text[locale] = localized
  }
  return { ok: true, story }
}

/** The request body as stories: JSON Lines (blank lines skipped), or one JSON array. */
export function parseImport(body: string): { line: number; parsed: ParsedLine }[] {
  const trimmed = body.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const list = JSON.parse(trimmed) as unknown
      if (Array.isArray(list)) return list.map((value, index) => ({ line: index + 1, parsed: parseImportStory(value) }))
    } catch {
      return [{ line: 1, parsed: { ok: false, error: 'the body starts with "[" but is not a JSON array' } }]
    }
  }
  return body.split('\n').flatMap((raw, index) => {
    if (!raw.trim()) return []
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      return [{ line: index + 1, parsed: { ok: false, error: 'not valid JSON' } as const }]
    }
    return [{ line: index + 1, parsed: parseImportStory(value) }]
  })
}

/** The slugs to try for a new story whose slug is taken: with its date appended, then numbered. */
export function slugCandidates(slug: string, publishedAt: string): string[] {
  const dated = `${slug.slice(0, 69).replace(/-+$/, '')}-${publishedAt.slice(0, 10)}`
  return [slug, dated, ...[2, 3, 4, 5].map((n) => `${dated}-${n}`)]
}

/** The approval time of a new imported story: its publish time, never in the future. */
export function importApprovedAt(publishedAt: string, now: Date): string {
  return new Date(Math.min(Date.parse(publishedAt), now.getTime())).toISOString()
}
