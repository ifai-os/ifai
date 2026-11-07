import type { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { dayKey, serverTimeZone } from '@/lib/local-time'

import { posterDay } from './list-params'

/**
 * How much of a search result's description line a topic's description may fill: 160 characters
 * in English; about 90 Chinese, Japanese or Korean characters, where a letter, digit or space
 * takes half the room of one (`width`).
 */
export const topicDescriptionRoom: Record<Locale, number> = { en: 160, 'zh-Hans': 90, 'zh-Hant': 90, ja: 90, ko: 90 }

const wide = /[\u1100-\u115f\u2e80-\u303f\u3040-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/

/** Room a character takes: one in English; in the other languages half for a narrow one. */
function width(char: string, locale: Locale): number {
  return locale === 'en' || wide.test(char) ? 1 : 0.5
}

/** Room `text` takes in a search result's description line; exported for the tests. */
export function widthOf(text: string, locale: Locale): number {
  return Array.from(text).reduce((sum, char) => sum + width(char, locale), 0)
}

/** `text` cut to `room`, with an ellipsis (which takes one) when cut; English at a space, keeping words whole. */
function clipTo(text: string, room: number, locale: Locale): string {
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
  return `${kept.trimEnd()}…`
}

type DailyTranslator = Awaited<ReturnType<typeof getTranslations<'daily'>>>

/** The description of a topic page (./metadata.ts `topicMetadata`). */
export function topicDescription(
  topic: { name: string; total: number; stories: { publishedAt: string; title: { value: string } }[] },
  page: number,
  locale: Locale,
  t: DailyTranslator,
): string {
  const values = { name: topic.name, count: topic.total }
  const latest = page === 1 ? topic.stories[0] : undefined
  if (!latest) return t('topicPageDescription', { ...values, page })
  const date = posterDay(dayKey(new Date(latest.publishedAt), serverTimeZone), locale, false)
  const room = topicDescriptionRoom[locale]
  const full = t('topicDescription', { ...values, date, latest: latest.title.value })
  const over = widthOf(full, locale) - room
  if (over <= 0) return full
  const left = widthOf(latest.title.value, locale) - over
  // A name too long to leave the story's title anything useful: the whole cut instead.
  if (left < 10) return clipTo(full, room, locale)
  return t('topicDescription', { ...values, date, latest: clipTo(latest.title.value, left, locale) })
}
