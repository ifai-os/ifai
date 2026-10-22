import { useTranslations } from 'next-intl'

import { InitialTile } from '@/components/cards/initial-tile'
import { Link } from '@/i18n/navigation'

export type AppCardProps = {
  href: `/${string}`
  name: string
  initials: string
  tone?: number
  category: string
  description: string
  /** Heat score, 0–100. Not a visit count. */
  heat: number
  rank: number
}

export function AppCard({ href, name, initials, tone, category, description, heat, rank }: AppCardProps) {
  const t = useTranslations('card')

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-card border border-surface-2 bg-bg px-5 py-4.5 transition-colors hover:border-line"
    >
      <span className="flex items-center gap-3">
        <InitialTile label={initials} tone={tone} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-title font-semibold group-hover:text-accent">{name}</span>
          <span className="text-small text-ink-4">{category}</span>
        </span>
        <span className={`text-body font-semibold ${rank <= 3 ? 'text-accent' : 'text-ink-4'}`}>
          <span aria-hidden="true">#{rank}</span>
          <span className="sr-only">{t('rank', { rank })}</span>
        </span>
      </span>
      <span className="line-clamp-2 text-ui text-ink-2">{description}</span>
      <span className="text-small text-ink-4">{t('heat', { value: heat })}</span>
    </Link>
  )
}
