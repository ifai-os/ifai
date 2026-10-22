import { useFormatter, useTranslations } from 'next-intl'

import { InitialTile } from '@/components/cards/initial-tile'
import { Link } from '@/i18n/navigation'

export type SkillCardProps = {
  href: `/${string}`
  name: string
  author: string
  description: string
  initials: string
  tone?: number
  rating: number
  installs: number
}

export function SkillCard({ href, name, author, description, initials, tone, rating, installs }: SkillCardProps) {
  const t = useTranslations('card')
  const format = useFormatter()
  const ratingText = format.number(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const installsText = format.number(installs, { notation: 'compact', maximumFractionDigits: 1 })

  return (
    <article className="flex flex-col gap-3 rounded-card border border-surface-2 bg-surface p-4.5">
      <div className="flex items-center gap-3">
        <InitialTile label={initials} tone={tone} size="md" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={href} className="truncate text-body font-semibold hover:text-accent">
            {name}
          </Link>
          <span className="text-small text-ink-4">{author}</span>
        </div>
      </div>
      <p className="flex-1 text-meta text-ink-2">{description}</p>
      <div className="flex items-center justify-between gap-2 text-small text-ink-4">
        <span>
          <span aria-hidden="true">
            ★ {ratingText} · ↓ {installsText}
          </span>
          <span className="sr-only">
            {t('rating', { value: ratingText })}, {t('installs', { count: installsText })}
          </span>
        </span>
        <Link
          href={href}
          className="flex h-7.5 items-center rounded-pill border border-line bg-bg px-3 text-small text-ink transition-colors hover:border-ink-4"
        >
          {t('install')}
        </Link>
      </div>
    </article>
  )
}
