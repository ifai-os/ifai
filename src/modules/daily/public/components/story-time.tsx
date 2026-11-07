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

/**
 * A publish time that may only know its day (../../date-only.ts), as the date and time or the date
 * alone: a story's on its page, a source's in its list. A day-only time is shown as the day it was
 * given, never as a made-up clock time in the reader's zone (midnight UTC is 17:00 the day before
 * in Los Angeles).
 */
export function PublishTime({ iso, zone = false, className }: { iso: string; zone?: boolean; className?: string }) {
  const format = useFormatter()
  const day = dateOnlyDay(iso)
  if (!day) return <LocalTime iso={iso} zone={zone} className={className} />
  return (
    <time dateTime={day} className={className}>
      {format.dateTime(dateOfKey(day), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
    </time>
  )
}

/** The detail page's publish time: the date and time with its zone, or only the date it was given. */
export function StoryPublished({ iso }: { iso: string }) {
  return <PublishTime iso={iso} zone />
}

/** A story's publish date in a short list: the day it was given, else its day in the reader's zone. */
export function StoryDate({ iso, className }: { iso: string; className?: string }) {
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const key = storyDayKey(iso, timeZone)
  return (
    <time dateTime={iso} className={className}>
      {format.dateTime(dateOfKey(key), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
    </time>
  )
}
