import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { daysSince } from '../boards'
import type { HeatedApp } from '../data'
import { AppTile } from './app-tile'
import { HeatDelta } from './heat-delta'

/** 「本周新上架」beside the list: the newest apps of the last 7 days, with how long ago and their change. */
export function Newcomers({ apps, now }: { apps: HeatedApp[]; now: Date }) {
  const t = useTranslations('apps')
  if (apps.length === 0) return null

  return (
    <section
      aria-labelledby="newcomers"
      className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5 rounded-hero border border-surface-2 bg-surface px-6 py-5.5"
    >
      <h2 id="newcomers" className="text-title">
        {t('newcomers')}
      </h2>
      <ul className="flex flex-col">
        {apps.map((app) => (
          <li key={app.id}>
            <Link href={`/apps/${app.slug}`} className="group flex items-center gap-2.5 py-1.5">
              <AppTile name={app.name} slug={app.slug} logo={app.logo} size="sm" />
              <span className="min-w-0 flex-1 truncate text-ui group-hover:text-accent-ink">{app.name}</span>
              <span className="flex-none text-small text-ink-4">
                {app.listedAt && t('addedDays', { days: daysSince(app.listedAt, now) })}
                {app.heat?.change7d ? (
                  <>
                    {' · '}
                    <HeatDelta change={app.heat.change7d} />
                  </>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
