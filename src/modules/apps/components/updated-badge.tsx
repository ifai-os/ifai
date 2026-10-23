'use client'

import { DateBadge } from '@/components/cards/date-badge'
import { useReaderTimeZone } from '@/components/local-time'
import { dateOfKey, dayKey } from '@/lib/local-time'

/** The list header's calendar tile: the day heat was last updated, in the reader's time zone. */
export function UpdatedBadge({ iso }: { iso: string }) {
  const timeZone = useReaderTimeZone()
  return <DateBadge date={dateOfKey(dayKey(new Date(iso), timeZone))} />
}
