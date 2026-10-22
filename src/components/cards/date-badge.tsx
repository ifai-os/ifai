import { useFormatter } from 'next-intl'

const sizes = {
  // Hero tiles (home page, daily list header).
  md: { tile: 'w-18', strip: 'h-6.5 text-meta leading-6.5', day: 'h-11 text-h1 leading-11' },
  // Day-group headers in the daily list.
  sm: { tile: 'w-12', strip: 'h-5 text-small leading-5', day: 'h-8 text-h3 leading-8' },
} as const

/** Calendar tile: accent strip with the weekday, day of month below. Reads the date in UTC: pass UTC midnight of the calendar day to show. */
export function DateBadge({ date, size = 'md' }: { date: Date; size?: keyof typeof sizes }) {
  const format = useFormatter()
  const classes = sizes[size]

  return (
    <div
      className={`flex ${classes.tile} flex-none flex-col overflow-hidden rounded-card border border-line bg-bg text-center shadow-float`}
    >
      <span className={`${classes.strip} bg-accent font-medium text-white`}>
        {format.dateTime(date, { weekday: 'short', timeZone: 'UTC' })}
      </span>
      <time dateTime={date.toISOString().slice(0, 10)} className={`${classes.day} font-medium`}>
        {date.getUTCDate()}
      </time>
    </div>
  )
}
