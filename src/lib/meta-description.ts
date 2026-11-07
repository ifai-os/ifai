import type { Locale } from '@/i18n/config'

/**
 * Meta descriptions sized for a search result's description line: 160 characters in English;
 * about 90 Chinese, Japanese or Korean characters, where a letter, digit or space takes half the
 * room of one. A longer text ends at its last full sentence that fits, else is cut with "…"
 * (English at a space, keeping words whole).
 */
export const descriptionRoom: Record<Locale, number> = { en: 160, 'zh-Hans': 90, 'zh-Hant': 90, ja: 90, ko: 90 }

const wide = /[ᄀ-ᅟ⺀-〿぀-꓏가-힯豈-﫿︰-﹏＀-｠￠-￦]/
/** A sentence ends here: a full-width stop, or a narrow one followed by a space or the end. */
const sentenceEnd = /[。！？]|[.!?](?=\s|$)/g

/** Room a character takes: one in English; in the other languages half for a narrow one. */
function width(char: string, locale: Locale): number {
  return locale === 'en' || wide.test(char) ? 1 : 0.5
}

/** Room `text` takes in a search result's description line. */
export function widthOf(text: string, locale: Locale): number {
  return Array.from(text).reduce((sum, char) => sum + width(char, locale), 0)
}

/** `text` cut to `room`, with an ellipsis (which takes one) when cut; English at a space, keeping words whole. */
export function clipTo(text: string, room: number, locale: Locale): string {
  if (widthOf(text, locale) <= room) return text
  let used = 1
  let kept = ''
  for (const char of Array.from(text)) {
    used += width(char, locale)
    if (used > room) break
    kept += char
  }
  const space = kept.lastIndexOf(' ')
  if (locale === 'en' && space > 0) kept = kept.slice(0, space)
  kept = kept.trimEnd()
  // Cut right after a sentence: it reads as whole, no ellipsis.
  return /[。！？.!?]$/.test(kept) ? kept : `${kept}…`
}

/**
 * A page's description from a longer text (a summary, an article's first paragraphs): spaces
 * collapsed, then whole sentences while they fit, as long as they fill at least half the room;
 * otherwise cut. `locale` is the language the text is written in.
 */
export function metaDescription(text: string, locale: Locale): string {
  const plain = text.replace(/\s+/g, ' ').trim()
  const room = descriptionRoom[locale]
  if (widthOf(plain, locale) <= room) return plain
  let best = ''
  for (const match of plain.matchAll(sentenceEnd)) {
    const sentences = plain.slice(0, match.index + match[0].length)
    if (widthOf(sentences, locale) > room) break
    best = sentences
  }
  return widthOf(best, locale) >= room / 2 ? best : clipTo(plain, room, locale)
}
