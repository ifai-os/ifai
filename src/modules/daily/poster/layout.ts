/**
 * Type sizes for a poster image: the largest that still fits 1080 × 1920. Lines are counted by
 * wrapping each text the way the renderer does, with the glyph widths of the poster fonts
 * (./fonts.ts), so three short stories get big type and a line of summary each, and eight long
 * English titles get the smallest. Pure.
 */
import type { InLanguage } from '@/lib/i18n/localized'

export const POSTER_SIZE = { width: 1080, height: 1920 } as const

export type PosterType = {
  headTitle: number
  summary: number
  /** Most lines of the head story's summary. */
  summaryLines: number
  title: number
  /** Lines of summary under each numbered story; 0 shows titles only. */
  briefLines: number
  brief: number
  meta: number
  /** Vertical padding of each numbered story. */
  pad: number
}

// The fixed parts, in pixels (./image.tsx draws them with these numbers).
export const frame = {
  top: 72,
  side: 72,
  bottom: 56,
  logo: 56,
  dateTop: 36,
  dateSize: 72,
  dateGap: 10,
  lineSize: 28,
  cardTop: 40,
  cardPad: 40,
  cardGap: 18,
  pillSize: 24,
  pillPad: 6,
  listTop: 12,
  number: 56,
  numberGap: 24,
  storySide: 8,
  storyGap: 6,
  footerGap: 24,
  footerPad: 24,
  footerSize: 22,
} as const

export const lineHeights = { date: 1.15, line: 1.4, headTitle: 1.3, summary: 1.55, title: 1.4, brief: 1.5, meta: 1.4, pill: 1.4, footer: 1.4 } as const

/** Most lines of a title before the renderer cuts it with "…". */
export const titleLines = { head: 4, other: 3 } as const

const headWidth = POSTER_SIZE.width - 2 * frame.side - 2 * frame.cardPad
const storyWidth = POSTER_SIZE.width - 2 * frame.side - 2 * frame.storySide - frame.number - frame.numberGap

// Advance widths in ems of the printable ASCII characters, space to "~", bold: the wider of
// Noto Sans and the Latin letters of the CJK families, so an estimate errs towards more lines.
const asciiEms = [
  0.26, 0.37, 0.57, 0.65, 0.59, 0.96, 0.75, 0.33, 0.38, 0.38, 0.54, 0.59, 0.33, 0.37, 0.33, 0.41,
  0.59, 0.59, 0.59, 0.59, 0.59, 0.59, 0.59, 0.59, 0.59, 0.59, 0.33, 0.33, 0.59, 0.59, 0.59, 0.51,
  1.01, 0.69, 0.68, 0.66, 0.73, 0.61, 0.58, 0.72, 0.77, 0.39, 0.57, 0.69, 0.58, 0.94, 0.81, 0.79,
  0.67, 0.79, 0.68, 0.62, 0.62, 0.76, 0.65, 0.97, 0.67, 0.63, 0.61, 0.38, 0.41, 0.38, 0.59, 0.57,
  0.63, 0.6, 0.64, 0.53, 0.64, 0.6, 0.39, 0.63, 0.65, 0.3, 0.31, 0.62, 0.32, 0.97, 0.65, 0.63,
  0.64, 0.64, 0.45, 0.5, 0.43, 0.65, 0.58, 0.86, 0.58, 0.57, 0.51, 0.39, 0.55, 0.39, 0.59,
]

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code >= 0x20000
  )
}

const isHangul = (code: number) => code >= 0xac00 && code <= 0xd7a3

/** Width of one character in ems; punctuation the Chinese fonts set full width counts as wide. */
export function charEms(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code >= 0x20 && code <= 0x7e) return asciiEms[code - 0x20]
  if (isHangul(code)) return 0.92
  if (isWide(code) || '…·—‘’“”'.includes(char)) return 1
  return 0.6
}

// Chinese and Japanese line breaking: these never start a line, and these never end one.
const noStart = new Set('，。、：；！？）」』》〉】〕…・ー’”%,.:;!?)]}')
const noEnd = new Set('（「『《〈【〔‘“([{')

export type Piece = { width: number; space: number }

/**
 * A text cut where a line may break: after spaces and hyphens, and next to Chinese and Japanese
 * characters; Korean (`keepAll`) breaks at spaces only. Widths in ems; `space` is the space
 * after a piece, which hangs at the end of a line.
 */
export function pieces(text: string, keepAll = false): Piece[] {
  const chars = [...text]
  const result: Piece[] = []
  let width = 0
  chars.forEach((char, index) => {
    if (char === ' ') {
      if (width > 0) {
        result.push({ width, space: charEms(char) })
        width = 0
      } else if (result.length > 0) result[result.length - 1].space += charEms(char)
      return
    }
    width += charEms(char)
    const next = chars[index + 1]
    if (next === undefined || next === ' ') return
    const wide = isWide(char.codePointAt(0) ?? 0) || isWide(next.codePointAt(0) ?? 0)
    if ((char === '-' && /\p{L}/u.test(next)) || (!keepAll && wide && !noEnd.has(char) && !noStart.has(next))) {
      result.push({ width, space: 0 })
      width = 0
    }
  })
  if (width > 0) result.push({ width, space: 0 })
  return result
}

/** Lines a text takes at a font size in a width (pixels), wrapped piece by piece. */
export function lineCount(text: string, size: number, width: number, keepAll = false): number {
  const room = width / size
  const parts = pieces(text, keepAll)
  let breaks = 0
  let used = 0
  for (const piece of parts) {
    if (used > 0 && used + piece.width > room) {
      breaks += 1
      used = 0
    }
    // A word wider than the whole line runs on over more lines.
    const extra = Math.max(0, Math.ceil(piece.width / room) - 1)
    breaks += extra
    used += piece.width - extra * room + piece.space
  }
  return parts.length > 0 ? breaks + 1 : 0
}

export type PosterTexts = {
  headTitle: InLanguage<string>
  summary: InLanguage<string> | null
  /** The numbered stories, in order. */
  stories: { title: InLanguage<string>; brief: InLanguage<string> | null }[]
}

function lines(text: InLanguage<string> | null, size: number, width: number, max: number): number {
  return text ? Math.min(max, lineCount(text.value, size, width, text.lang === 'ko')) : 0
}

/** Height of one numbered story, its padding and rule included. */
export function storyHeight(story: PosterTexts['stories'][number], type: PosterType): number {
  const briefLines = type.briefLines > 0 ? lines(story.brief, type.brief, storyWidth, type.briefLines) : 0
  return (
    2 * type.pad +
    lines(story.title, type.title, storyWidth, titleLines.other) * type.title * lineHeights.title +
    (briefLines > 0 ? frame.storyGap + briefLines * type.brief * lineHeights.brief : 0) +
    frame.storyGap +
    type.meta * lineHeights.meta +
    1
  )
}

/** Estimated height of the whole poster with one set of sizes. */
export function posterHeight(texts: PosterTexts, type: PosterType): number {
  const header = frame.logo + frame.dateTop + frame.dateSize * lineHeights.date + frame.dateGap + frame.lineSize * lineHeights.line
  const summaryLines = lines(texts.summary, type.summary, headWidth, type.summaryLines)
  const card =
    frame.cardTop +
    2 * frame.cardPad +
    frame.pillSize * lineHeights.pill +
    2 * frame.pillPad +
    frame.cardGap +
    lines(texts.headTitle, type.headTitle, headWidth, titleLines.head) * type.headTitle * lineHeights.headTitle +
    (summaryLines > 0 ? frame.cardGap + summaryLines * type.summary * lineHeights.summary : 0)
  const list = frame.listTop + texts.stories.reduce((sum, story) => sum + storyHeight(story, type), 0)
  const footer = frame.footerGap + frame.footerPad + 1 + frame.footerSize * lineHeights.footer
  return frame.top + header + card + list + footer + frame.bottom
}

const base = { headTitle: 56, summary: 30, title: 40, brief: 26, meta: 24, pad: 28 }

/**
 * From the richest: a few lines of summary under every story (few stories), then titles only
 * with less and less of the head's summary (many stories).
 */
export const posterLayouts = [
  { briefLines: 3, summaryLines: 6, minScale: 1.1 },
  { briefLines: 2, summaryLines: 5, minScale: 0.9 },
  { briefLines: 0, summaryLines: 4, minScale: 0.8 },
  { briefLines: 0, summaryLines: 3, minScale: 0.7 },
  { briefLines: 0, summaryLines: 2, minScale: 0.6 },
] as const

/** Few stories get bigger type, up to this; the base sizes suit five or six. */
export const MAX_SCALE = 1.5

type Layout = (typeof posterLayouts)[number]

export function typeAt(scale: number, layout: Layout): PosterType {
  const size = (px: number, min: number) => Math.max(min, Math.round(px * scale))
  return {
    headTitle: size(base.headTitle, 0),
    summary: size(base.summary, 22),
    summaryLines: layout.summaryLines,
    title: size(base.title, 0),
    briefLines: layout.briefLines,
    brief: size(base.brief, 22),
    meta: size(base.meta, 20),
    pad: size(base.pad, 8),
  }
}

/** Whether every title shows in full: summaries may be cut, titles only when nothing else fits. */
function titlesWhole(texts: PosterTexts, type: PosterType): boolean {
  const whole = (text: InLanguage<string>, size: number, width: number, max: number) => lineCount(text.value, size, width, text.lang === 'ko') <= max
  return (
    whole(texts.headTitle, type.headTitle, headWidth, titleLines.head) &&
    texts.stories.every((story) => whole(story.title, type.title, storyWidth, titleLines.other))
  )
}

/**
 * The richest layout that fits, at the largest scale that fits, keeping every title whole;
 * failing that, the same allowing long titles to be cut; failing that, the smallest (the list
 * is then cut, never the footer).
 */
export function posterType(texts: PosterTexts): PosterType {
  for (const whole of [true, false]) {
    const fits = (scale: number, layout: Layout) => {
      const type = typeAt(scale, layout)
      return posterHeight(texts, type) <= POSTER_SIZE.height && (!whole || titlesWhole(texts, type))
    }
    for (const layout of posterLayouts) {
      if (!fits(layout.minScale, layout)) continue
      if (fits(MAX_SCALE, layout)) return typeAt(MAX_SCALE, layout)
      let low: number = layout.minScale
      let high: number = MAX_SCALE
      for (let step = 0; step < 12; step++) {
        const middle = (low + high) / 2
        if (fits(middle, layout)) low = middle
        else high = middle
      }
      return typeAt(low, layout)
    }
  }
  const last = posterLayouts[posterLayouts.length - 1]
  return typeAt(last.minScale, last)
}
