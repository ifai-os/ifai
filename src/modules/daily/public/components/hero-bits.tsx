'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { DateBadge } from '@/components/cards/date-badge'
import { useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { dateOfKey } from '@/lib/local-time'

/** The list header's calendar tile: the reader's own today. */
export function TodayBadge({ serverToday }: { serverToday: string }) {
  const today = useReaderToday(serverToday)
  return <DateBadge date={dateOfKey(today)} />
}

/** "Updated 09:42", in the reader's zone. */
export function UpdatedStat({ iso }: { iso: string }) {
  const t = useTranslations('daily')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  return (
    <span>
      {t('updatedStat', { time: format.dateTime(new Date(iso), { hour: 'numeric', minute: '2-digit', timeZone }) })}
    </span>
  )
}
