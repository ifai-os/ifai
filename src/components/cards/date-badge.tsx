import { useFormatter } from 'next-intl'

const sizes = {
  // Hero tiles (home page, daily list header).
  md: { tile: 'w-18 rounded-card', strip: 'h-6.5 text-meta leading-6.5', day: 'h-11 text-h1 leading-11' },
  // Day-group headers in the daily list (「IFAI 日报（新版）」: 40 wide, a 19 strip over a 21 day).
  sm: { tile: 'w-10 rounded-thumb', strip: 'h-4.75 text-micro leading-4.75', day: 'h-5.25 text-body leading-5.25' },
} as const

/** Calendar tile: accent strip with the weekday, day of month below. Reads the date in UTC: pass UTC midnight of the calendar day to show. */
export function DateBadge({ date, size = 'md' }: { date: Date; size?: keyof typeof sizes }) {
  const format = useFormatter()
  const classes = sizes[size]

  return (
    <div
      className={`flex ${classes.tile} flex-none flex-col overflow-hidden border border-line bg-bg text-center shadow-float`}
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
