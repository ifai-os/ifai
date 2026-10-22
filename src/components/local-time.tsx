'use client'

import { type DateTimeFormatOptions, useFormatter } from 'next-intl'
import { useSyncExternalStore } from 'react'

import { dayKey, readerTimeZone, serverTimeZone } from '@/lib/local-time'

// Nothing to subscribe to: the zone is read once on the client; React re-renders after hydration.
const subscribe = () => () => {}

/** The reader's time zone on the client; UTC on the server and while hydrating, so the markup matches. */
export function useReaderTimeZone(): string {
  return useSyncExternalStore(subscribe, readerTimeZone, () => serverTimeZone)
}

/** Today's calendar date in the reader's zone; `serverToday` (UTC) on the server and while hydrating. */
export function useReaderToday(serverToday: string): string {
  return useSyncExternalStore(subscribe, () => dayKey(new Date(), readerTimeZone()), () => serverToday)
}

export type LocalTimeStyle = 'time' | 'date' | 'dateTime'

const styles: Record<LocalTimeStyle, DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit' },
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
}

type LocalTimeProps = {
  /** An ISO 8601 instant, as stored. */
  iso: string
  style?: LocalTimeStyle
  /** Also names the zone ("GMT+8"), where the reader might wonder whose time it is. */
  zone?: boolean
  className?: string
}

/** An instant in the reader's local time, with the UTC instant in `datetime` for machines. */
export function LocalTime({ iso, style = 'dateTime', zone = false, className }: LocalTimeProps) {
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const options: DateTimeFormatOptions = { ...styles[style], timeZone }
  if (zone) options.timeZoneName = 'short'
  const text = format.dateTime(new Date(iso), options)
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  )
}
