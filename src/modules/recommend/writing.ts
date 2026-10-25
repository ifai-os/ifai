import { cleanLine, parseId, textLength } from '@/modules/apps/reviews/rules'

import { cleanTags, isArticleChannel, maxSummaryLength, maxTitleLength, type ArticleChannel } from './rules'

export { parseId }

/**
 * Readers writing articles (docs/specs/recommend.md rules 12–17): the limits, input checks and
 * error names shared by the API, the writing page and the back office. No server imports, so the
 * page's own code can use it.
 */
export const writeRules = {
  /** New articles (drafts too) a member can start per Shanghai day. */
  dailyArticles: 10,
  /** Pictures a member can upload per Shanghai day, used or not. */
  dailyImages: 50,
  /** Characters (code points) of Markdown. */
  maxMarkdown: 50_000,
  /** What the server takes, after the browser has shrunk a picture. */
  maxUploadBytes: 4 * 1024 * 1024,
  /** What the browser will try to shrink. */
  maxPickedBytes: 40 * 1024 * 1024,
  /** Longest side kept, in pixels. */
  maxSide: 2048,
  /** Pixels in a picture, at most. */
  maxPixels: 50_000_000,
} as const

export const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export const reportReasons = ['spam', 'abuse', 'offTopic', 'other'] as const
export type ReportReason = (typeof reportReasons)[number]

/** Why the API turned a request down; `recommend.write.errors.*` in messages/*.json. */
export type WriteError =
  | 'cross-site'
  | 'sign-in'
  | 'invalid-request'
  | 'not-found'
  | 'daily-limit'
  | 'title-empty'
  | 'title-too-long'
  | 'summary-too-long'
  | 'invalid-channel'
  | 'body-empty'
  | 'body-too-long'
  | 'image-source'
  | 'image-line'
  | 'invalid-image'
  | 'too-large'
  | 'hidden'
  | 'own-article'

/** What a member sends to save an article: a draft, or the article to publish. */
export type ArticleInput = {
  title: string
  summary: string
  channel: ArticleChannel
  tags: string[]
  markdown: string
  /** An `article-images` id the member uploaded, or none. */
  cover: number | null
  publish: boolean
}

// Control characters other than tab and line feed, zero-width spaces and direction marks, overrides
// and isolates (as src/modules/apps/reviews/rules.ts). Indentation and blank lines stay: they are Markdown.
const invisible = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​‎‏‪-‮⁠-⁤⁦-⁩﻿]/gu

/** Markdown as it is kept: Unix line breaks, no invisible characters, no trailing blank lines. */
export function cleanMarkdown(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(invisible, '').replace(/\s+$/u, '')
}

/** Tags as typed: separated by commas (either width) or line breaks. */
export function splitTags(value: string): string[] {
  return value.split(/[,，、\n]/u)
}

/**
 * POST /api/recommend/articles and PATCH …?id=: title and channel always, the body only to
 * publish (rule 15). Tags are tidied as the back office tidies them.
 */
export function parseArticleInput(input: unknown): { ok: true; value: ArticleInput } | { ok: false; error: WriteError } {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const title = typeof fields.title === 'string' ? cleanLine(fields.title) : ''
  if (!title) return { ok: false, error: 'title-empty' }
  if (textLength(title) > maxTitleLength) return { ok: false, error: 'title-too-long' }
  const summary = typeof fields.summary === 'string' ? cleanLine(fields.summary) : ''
  if (textLength(summary) > maxSummaryLength) return { ok: false, error: 'summary-too-long' }
  if (!isArticleChannel(fields.channel)) return { ok: false, error: 'invalid-channel' }
  const rawTags = Array.isArray(fields.tags) ? fields.tags : typeof fields.tags === 'string' ? splitTags(fields.tags) : []
  const markdown = typeof fields.markdown === 'string' ? cleanMarkdown(fields.markdown) : ''
  if (textLength(markdown) > writeRules.maxMarkdown) return { ok: false, error: 'body-too-long' }
  const publish = fields.publish === true
  if (publish && !markdown.trim()) return { ok: false, error: 'body-empty' }
  const cover = fields.cover === null || fields.cover === undefined ? null : parseId(fields.cover)
  if (fields.cover !== null && fields.cover !== undefined && cover === null) return { ok: false, error: 'invalid-request' }
  return { ok: true, value: { title, summary, channel: fields.channel, tags: cleanTags(rawTags), markdown, cover, publish } }
}

/** POST /api/recommend/report { article, reason }. */
export function parseReportInput(input: unknown): { article: number; reason: ReportReason } | null {
  const fields = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const article = parseId(fields.article)
  const reason = fields.reason
  if (!article || typeof reason !== 'string' || !(reportReasons as readonly string[]).includes(reason)) return null
  return { article, reason: reason as ReportReason }
}

// ── Pictures in the Markdown ─────────────────────────────

/** A picture alone on its line: `![caption](address)`, with an optional "title" after the address. */
const imageLine = /^\s{0,3}!\[([^\]\n]*)\]\(\s*<?([^\s<>()]+)>?(?:\s+"[^"\n]*")?\s*\)\s*$/u
/** A picture anywhere in a line. */
const imageAnywhere = /!\[[^\]\n]*\]\([^)\n]*\)/u

/** The line the writing page inserts for an uploaded picture. */
export function imageMarkdown(url: string, caption = ''): string {
  return `![${caption.replace(/[[\]\n]/g, ' ').trim()}](${url})`
}

/**
 * An uploaded picture's file name from its address, however the page or the reader wrote it
 * (whole or from `/api/…`, with `?…` after it): the last part of the path. Null when it is
 * not one of IFAI's article pictures.
 */
export function imageFileName(address: string): string | null {
  let path: string
  try {
    path = new URL(address, 'https://ifai.invalid').pathname
  } catch {
    return null
  }
  const match = /\/api\/article-images\/file\/([^/]+)$/.exec(path)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export type MarkdownPart = { kind: 'markdown'; text: string } | { kind: 'image'; caption: string; file: string }

const fence = /^\s{0,3}(`{3,}|~{3,})/

/**
 * The Markdown cut into prose and pictures (rule 14), with headings and list indents made to fit
 * the body's formats (rule 13): `#` becomes `##`, `####` and smaller become `###`, and lists
 * indented by two spaces nest as if by four. Code blocks are left as they are. A picture not on
 * a line of its own, or not one of IFAI's, is an error.
 */
export function splitMarkdown(markdown: string): { ok: true; parts: MarkdownPart[] } | { ok: false; error: 'image-source' | 'image-line' } {
  const parts: MarkdownPart[] = []
  let prose: string[] = []
  let open: string | null = null
  const flush = () => {
    if (prose.join('').trim()) parts.push({ kind: 'markdown', text: prose.join('\n') })
    prose = []
  }

  for (const line of markdown.split('\n')) {
    const marker = fence.exec(line)?.[1]
    if (open) {
      prose.push(line)
      if (marker && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) open = null
      continue
    }
    if (marker) {
      open = marker
      prose.push(line)
      continue
    }
    const image = imageLine.exec(line)
    if (image) {
      const file = imageFileName(image[2])
      if (!file) return { ok: false, error: 'image-source' }
      flush()
      parts.push({ kind: 'image', caption: cleanLine(image[1]), file })
      continue
    }
    if (imageAnywhere.test(line.replace(/`[^`]*`/g, ''))) return { ok: false, error: 'image-line' }
    prose.push(
      line
        .replace(/^(\s{0,3})#(?!#)(\s)/, '$1##$2')
        .replace(/^(\s{0,3})#{4,6}(\s)/, '$1###$2')
        .replace(/^( +)(?=(?:[-*+]|\d+[.)])\s)/, (spaces) => ' '.repeat(Math.ceil(spaces.length / 2) * 4)),
    )
  }
  flush()
  return { ok: true, parts }
}

/** Uploaded pictures named in the Markdown, in order, each once. */
export function imageFiles(parts: MarkdownPart[]): string[] {
  return [...new Set(parts.flatMap((part) => (part.kind === 'image' ? [part.file] : [])))]
}
