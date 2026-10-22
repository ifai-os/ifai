import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { AppListItem } from '../data'
import { AppTile } from './app-tile'

/** Apps as rows: tile, name, one-line summary, category and pricing. */
export function AppList({ apps }: { apps: AppListItem[] }) {
  const t = useTranslations('apps')

  return (
    <ul className="flex flex-col md:rounded-card md:border md:border-surface-2">
      {apps.map((app) => (
        <li key={app.id} className="border-t border-surface-2 md:first:border-t-0">
          <Link
            href={`/apps/${app.slug}`}
            className="group grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 py-3 md:px-4 md:py-3.5"
          >
            <AppTile name={app.name} slug={app.slug} logo={app.logo} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-body font-semibold group-hover:text-accent">{app.name}</span>
              {app.tagline && (
                <span lang={app.tagline.lang} className="truncate text-meta text-ink-2">
                  {app.tagline.value}
                </span>
              )}
              <span className="text-small text-ink-4">
                {[app.category?.name, app.pricing && t(`pricing.${app.pricing}`)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
