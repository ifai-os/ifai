import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '@/i18n/navigation'

export type SkillCardProps = {
  href: `/${string}`
  name: string
  nameLang?: string
  author: string
  description: string | null
  descriptionLang?: string
  icon: ReactNode
  installs: number
  /** When the current version was published. */
  updatedAt: string | null
  /** The scan badge, under the description. */
  badge?: ReactNode
}

/**
 * A Skill on the home page: name, author, one-line summary, then installs, update date and the
 * scan badge in place of a star rating (docs/specs/resources.md, rule 9), and the install button.
 */
export function SkillCard({ href, name, nameLang, author, description, descriptionLang, icon, installs, updatedAt, badge }: SkillCardProps) {
  const t = useTranslations('card')
  const format = useFormatter()
  const meta = [
    t('installs', { count: format.number(installs, { notation: 'compact', maximumFractionDigits: 1 }) }),
    updatedAt && format.dateTime(new Date(updatedAt), { month: 'short', day: 'numeric' }),
  ].filter(Boolean)

  return (
    <article className="flex flex-col gap-3 rounded-card border border-surface-2 bg-surface p-4.5">
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={href} lang={nameLang} className="truncate text-body font-semibold hover:text-accent">
            {name}
          </Link>
          <span className="truncate text-small text-ink-4">{author}</span>
        </div>
      </div>
      <p lang={descriptionLang} className="line-clamp-2 flex-1 text-meta text-ink-2">
        {description}
      </p>
      {badge && <div className="flex">{badge}</div>}
      <div className="flex items-center justify-between gap-2 text-small text-ink-4">
        <span>{meta.join(' · ')}</span>
        <Link
          href={`${href}#install`}
          className="flex h-7.5 flex-none items-center rounded-pill border border-line bg-bg px-3 text-small text-ink transition-colors hover:border-ink-4"
        >
          {t('install')}
          <span className="sr-only">{name}</span>
        </Link>
      </div>
    </article>
  )
}
