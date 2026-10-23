import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '@/i18n/navigation'

export type AppCardProps = {
  href: `/${string}`
  name: string
  /** The app's icon or initial tile. */
  icon: ReactNode
  category: string | null
  description: string | null
  /** The language of the description, when it is not the page's (an English fallback). */
  descriptionLang?: string
  /** Heat score, 0–100. Not a visit count. Null before the app is first scored. */
  heat: number | null
  /** Place by heat; null when it has none yet. */
  rank: number | null
}

export function AppCard({ href, name, icon, category, description, descriptionLang, heat, rank }: AppCardProps) {
  const t = useTranslations('card')

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-card border border-surface-2 bg-bg px-5 py-4.5 transition-colors hover:border-line"
    >
      <span className="flex items-center gap-3">
        {icon}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-title font-semibold group-hover:text-accent">{name}</span>
          {category && <span className="text-small text-ink-4">{category}</span>}
        </span>
        {rank !== null && (
          <span className={`text-body font-semibold ${rank <= 3 ? 'text-accent' : 'text-ink-4'}`}>
            <span aria-hidden="true">#{rank}</span>
            <span className="sr-only">{t('rank', { rank })}</span>
          </span>
        )}
      </span>
      {description && (
        <span lang={descriptionLang} className="line-clamp-2 text-ui text-ink-2">
          {description}
        </span>
      )}
      {heat !== null && <span className="text-small text-ink-4">{t('heat', { value: heat })}</span>}
    </Link>
  )
}
