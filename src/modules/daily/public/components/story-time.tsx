'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { LocalTime, useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { dateOfKey, relativeDay } from '@/lib/local-time'

import { dateOnlyDay, storyDayKey } from '../../date-only'

/**
 * The day and time an instant falls on in the reader's zone (「IFAI 公司与产品话题页」board):
 * today or yesterday by name, a date of this year without the year, earlier years with it.
 * `relative` tells the category banner which of those it is. `time` is empty when the story only
 * knows its date (../../date-only.ts).
 */
export function useStoryDay(iso: string, serverToday: string): { day: string; time: string; relative: 'today' | 'yesterday' | null } {
  const t = useTranslations('daily')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const today = useReaderToday(serverToday)
  const key = storyDayKey(iso, timeZone)
  const relative = relativeDay(key, today)
  const day = relative
    ? t(relative)
    : format.dateTime(dateOfKey(key), {
        year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
  const time = dateOnlyDay(iso) ? '' : format.dateTime(new Date(iso), { hour: 'numeric', minute: '2-digit', timeZone })
  return { day, time, relative }
}

/**
 * The day above a story on a topic, category or tag page, once a day: nothing when the story before
 * it (`previousIso`) went up on the same day in the reader's zone. The time is in the card.
 */
export function StoryDay({ iso, previousIso, serverToday }: { iso: string; previousIso?: string; serverToday: string }) {
  const timeZone = useReaderTimeZone()
  const { day } = useStoryDay(iso, serverToday)
  if (previousIso && storyDayKey(previousIso, timeZone) === storyDayKey(iso, timeZone)) return null
  return (
    <time dateTime={iso} className="text-body font-medium">
      {day}
    </time>
  )
}

/** A story's publish time in a list row: the reader's local time, nothing when it only knows its date. */
export function StoryClock({ iso, className }: { iso: string; className?: string }) {
  return dateOnlyDay(iso) ? null : <LocalTime iso={iso} style="time" className={className} />
}

/** The detail page's publish time: the date and time with its zone, or only the date it was given. */
export function StoryPublished({ iso }: { iso: string }) {
  const format = useFormatter()
  const day = dateOnlyDay(iso)
  if (!day) return <LocalTime iso={iso} zone />
  return <time dateTime={day}>{format.dateTime(dateOfKey(day), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</time>
}
