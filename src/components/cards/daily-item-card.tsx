import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

export type DailyItemCardProps = {
  href: `/${string}`
  /** Position in today's issue, starting at 1. */
  no: number
  category: string
  title: string
  /** Two or three sentences. Omit for the compact headline row. */
  summary?: string
  /** Other outlets that reported the same event (after de-duplication). */
  moreSources?: number
}

/** One story in the Daily. Compact = headline row (home page); with a summary = full card (Daily page). */
export function DailyItemCard({ href, no, category, title, summary, moreSources }: DailyItemCardProps) {
  const t = useTranslations('card')
  const number = String(no).padStart(2, '0')

  return (
    <li className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 border-t border-line py-3.5">
      <span className="pt-0.5 text-body font-semibold text-accent">{number}</span>
      <div className="flex flex-col gap-1">
        <span className="text-small text-ink-4">{category}</span>
        <Link href={href} className="text-title text-ink hover:text-accent">
          {title}
        </Link>
        {summary && <p className="text-body text-ink-3">{summary}</p>}
        {moreSources !== undefined && (
          <span className="text-small text-ink-4">{t('moreSources', { count: moreSources })}</span>
        )}
      </div>
    </li>
  )
}
