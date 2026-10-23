import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { trendDays } from '../boards'
import type { RankedApp } from '../data'
import { AppTile } from './app-tile'
import { HeatDelta } from './heat-delta'
import { Sparkline } from './sparkline'

type PodiumProps = {
  /** The list's first three, all with heat. */
  apps: RankedApp[]
  heatDay: string
  showSiteRank: boolean
}

/** 热度前三: the list's top three as large cards above it. Wider screens only; on phones the list starts at once. */
export function Podium({ apps, heatDay, showSiteRank }: PodiumProps) {
  const t = useTranslations('apps')
  const card = useTranslations('card')

  return (
    <ol aria-label={t('podium')} className="hidden gap-4 md:grid md:grid-cols-3">
      {apps.map((app) => (
        <li key={app.id} className="flex min-w-0">
          <Link
            href={`/apps/${app.slug}`}
            className="group flex w-full flex-col gap-4 rounded-hero border border-surface-2 bg-surface px-6 py-5.5"
          >
            <span className="flex items-start justify-between gap-3">
              <AppTile name={app.name} slug={app.slug} logo={app.logo} size="xl" />
              <span className="text-display leading-none text-accent">
                <span aria-hidden="true">{String(app.place).padStart(2, '0')}</span>
                <span className="sr-only">{card('rank', { rank: app.place })}</span>
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-h3 font-semibold group-hover:text-accent">{app.name}</span>
              {app.tagline && (
                <span lang={app.tagline.lang} className="line-clamp-2 text-meta text-ink-3">
                  {app.tagline.value}
                </span>
              )}
            </span>
            {app.heat && (
              <span className="mt-auto flex items-end justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-h2 font-semibold">{app.heat.heat}</span>
                  <span className="text-small text-ink-4">
                    {t('heat')} · <HeatDelta change={app.heat.change7d} />
                    {showSiteRank && app.heat.trancoRank !== null && ` · ${t('siteRank', { rank: app.heat.trancoRank })}`}
                  </span>
                </span>
                <Sparkline
                  points={app.trend}
                  until={heatDay}
                  days={trendDays}
                  change={app.heat.change7d}
                  className="h-10 w-30 flex-none"
                />
              </span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  )
}
