'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { dayKey, relativeDay } from '@/lib/local-time'

/**
 * When a story on a topic page went up, in the reader's zone (「IFAI 公司与产品话题页」board):
 * today or yesterday by name, a date of this year without the year, earlier years with it; then
 * the time.
 */
export function TopicTime({ iso, serverToday }: { iso: string; serverToday: string }) {
  const t = useTranslations('daily')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const today = useReaderToday(serverToday)
  const date = new Date(iso)
  const key = dayKey(date, timeZone)
  const relative = relativeDay(key, today)
  const day = relative
    ? t(relative)
    : format.dateTime(date, { year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', month: 'long', day: 'numeric', timeZone })
  return (
    <time dateTime={iso} className="flex gap-2 text-body font-medium">
      <span>{day}</span>
      <span className="tabular-nums">{format.dateTime(date, { hour: 'numeric', minute: '2-digit', timeZone })}</span>
    </time>
  )
}
