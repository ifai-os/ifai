'use client'

import { useTranslations } from 'next-intl'

import { useReaderTimeZone, useReaderToday } from '@/components/local-time'
import { Link } from '@/i18n/navigation'
import { dayKey } from '@/lib/local-time'
import { AppTile } from '@/modules/apps/components/app-tile'

import type { MentionedApp } from '../data'

const appsShown = 6

type MentionedAppsProps = {
  /** Newest mention first, the last 48 hours. */
  apps: MentionedApp[]
  /** Today's date on the server (UTC), so the first render matches on both sides. */
  serverToday: string
}

/** 「今天提到的应用」(「IFAI 日报（新版）」board): apps that the stories of the reader's today are about. Nothing when there are none. */
export function MentionedApps({ apps, serverToday }: MentionedAppsProps) {
  const t = useTranslations('daily')
  const timeZone = useReaderTimeZone()
  const today = useReaderToday(serverToday)
  const shown = apps.filter((app) => dayKey(new Date(app.mentionedAt), timeZone) === today).slice(0, appsShown)
  if (!shown.length) return null

  return (
    // Three across in the column beside the stories (「IFAI 日报（新版）」), six when it runs the page's width.
    <section aria-labelledby="apps-today-title" className="@container flex flex-col gap-1">
      <h2 id="apps-today-title" className="pb-2 text-title">
        {t('appsToday')}
      </h2>
      <ul className="grid grid-cols-3 gap-2 @md:grid-cols-6">
        {shown.map((app) => (
          <li key={app.id} className="min-w-0">
            <Link
              href={`/apps/${app.slug}`}
              className="flex flex-col items-center gap-1.5 rounded-tile bg-surface px-1.5 py-2.5 text-micro text-ink hover:text-accent"
            >
              <AppTile name={app.name} slug={app.slug} logo={app.logo} size="compact" />
              <span className="w-full truncate text-center">{app.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
