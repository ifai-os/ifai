import { useTranslations } from 'next-intl'

/**
 * The 7-day change of heat:「▲ 12」「▼ 3」「持平」, colored by direction, with the direction in
 * words for screen readers. Null (no heat a week ago yet) shows a dash.
 */
export function HeatDelta({ change, className = '' }: { change: number | null; className?: string }) {
  const t = useTranslations('apps.delta')

  if (change === null) {
    return (
      <span className={`text-ink-4 ${className}`}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('none')}</span>
      </span>
    )
  }
  if (change === 0) return <span className={`text-ink-4 ${className}`}>{t('flat')}</span>

  const up = change > 0
  const count = Math.abs(change)
  return (
    <span className={`whitespace-nowrap ${up ? 'text-up' : 'text-down'} ${className}`}>
      <span aria-hidden="true">
        {up ? '▲' : '▼'} {count}
      </span>
      <span className="sr-only">{t(up ? 'up' : 'down', { count })}</span>
    </span>
  )
}
