'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { dayKey, relativeDay } from '@/lib/local-time'

/**
 * The day and time an instant falls on in the reader's zone (「IFAI 公司与产品话题页」board):
 * today or yesterday by name, a date of this year without the year, earlier years with it.
 * `relative` tells the category banner which of those it is.
 */
export function useStoryDay(iso: string, serverToday: string): { day: string; time: string; relative: 'today' | 'yesterday' | null } {
  const t = useTranslations('daily')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const today = useReaderToday(serverToday)
  const date = new Date(iso)
  const key = dayKey(date, timeZone)
  const relative = relativeDay(key, today)
  const day = relative
    ? t(relative)
    : format.dateTime(date, {
        year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone,
      })
  return { day, time: format.dateTime(date, { hour: 'numeric', minute: '2-digit', timeZone }), relative }
}

/** When a story on a topic or category page went up, above its card. */
export function StoryTime({ iso, serverToday }: { iso: string; serverToday: string }) {
  const { day, time } = useStoryDay(iso, serverToday)
  return (
    <time dateTime={iso} className="flex gap-2 text-body font-medium">
      <span>{day}</span>
      <span className="tabular-nums">{time}</span>
    </time>
  )
}
