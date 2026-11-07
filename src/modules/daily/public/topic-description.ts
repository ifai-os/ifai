import type { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { clipTo, descriptionRoom, widthOf } from '@/lib/meta-description'

import { posterDay } from './list-params'

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
  const room = descriptionRoom[locale]
  const full = t('topicDescription', { ...values, date, latest: latest.title.value })
  const over = widthOf(full, locale) - room
  if (over <= 0) return full
  const left = widthOf(latest.title.value, locale) - over
  // A name too long to leave the story's title anything useful: the whole cut instead.
  if (left < 10) return clipTo(full, room, locale)
  return t('topicDescription', { ...values, date, latest: clipTo(latest.title.value, left, locale) })
}
