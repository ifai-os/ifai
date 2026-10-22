import { useFormatter } from 'next-intl'

/** Calendar tile: accent strip with the weekday, day of month below. */
export function DateBadge({ date }: { date: Date }) {
  const format = useFormatter()

  return (
    <div className="flex w-18 flex-none flex-col overflow-hidden rounded-card border border-line bg-bg text-center shadow-float">
      <span className="h-6.5 bg-accent text-meta leading-6.5 font-medium text-white">
        {format.dateTime(date, { weekday: 'short', timeZone: 'UTC' })}
      </span>
      <time dateTime={date.toISOString().slice(0, 10)} className="h-11 text-h1 leading-11 font-medium">
        {date.getUTCDate()}
      </time>
    </div>
  )
}
