'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { tileTones } from '@/components/cards/initial-tile'
import { Link } from '@/i18n/navigation'

import type { CircleStats, CircleView } from '../rules'
import { useCircles } from './circles-provider'
import { PersonAvatar } from './person-avatar'

/** One card per circle: its color, name, members and posts today,「热议」, who posted lately, and「加入」. */
export function CircleCards() {
  const t = useTranslations('circles')
  const { circles, overview, circle: shown } = useCircles()
  if (circles.length === 0) return null
  const stats = new Map(overview.circles.map((item) => [item.id, item]))
  return (
    <section aria-label={t('circlesLabel')}>
      {/* Phones scroll the cards sideways; wider screens fill rows. `relative` keeps the cards' sr-only text inside the scroller, not widening the page. */}
      <ul className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:overflow-visible sm:px-0 sm:pb-0">
        {circles.map((circle) => (
          <CircleCard key={circle.id} circle={circle} stats={stats.get(circle.id)} selected={circle.id === shown?.id} />
        ))}
      </ul>
    </section>
  )
}

/** One circle; outlined while the feed shows only its posts. */
function CircleCard({ circle, stats, selected }: { circle: CircleView; stats: CircleStats | undefined; selected: boolean }) {
  const t = useTranslations('circles')
  const { joined, join, sessionPending } = useCircles()
  const [busy, setBusy] = useState(false)
  const isJoined = joined.includes(circle.id)
  const recent = stats?.recent ?? []

  async function toggle() {
    setBusy(true)
    await join(circle, !isJoined)
    setBusy(false)
  }

  return (
    <li
      className={`flex min-h-30 w-[min(240px,72vw)] flex-none snap-start flex-col gap-3.5 rounded-dialog px-4.5 py-4 sm:w-auto ${tileTones[circle.tone % tileTones.length]} ${
        selected ? 'ring-2 ring-ink ring-inset' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={{ pathname: '/circles', query: { circle: circle.slug } }}
            scroll={false}
            aria-current={selected ? 'page' : undefined}
            title={circle.description ?? undefined}
            className="text-title leading-snug font-semibold wrap-anywhere text-current hover:underline"
          >
            # {circle.name}
          </Link>
          <span className="text-small">
            {t('members', { count: stats?.members ?? 0 })}
            <span aria-hidden="true"> · </span>
            {t('today', { count: stats?.today ?? 0 })}
          </span>
          {circle.description && <span className="sr-only">{circle.description}</span>}
        </div>
        {stats?.hot && <span className="flex-none rounded-pill bg-accent px-2 py-0.5 text-micro font-medium text-white">{t('hot')}</span>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        {recent.length > 0 ? (
          <span className="flex" role="img" aria-label={t('recentPosters', { names: recent.map((person) => person.name || t('anonymous')).join(t('listSeparator')) })}>
            {recent.map((person, index) => (
              <PersonAvatar key={index} name={person.name || t('anonymous')} tone={person.tone} size="xs" className="-mr-1.5 ring-2 ring-white/80" />
            ))}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={busy || sessionPending}
          aria-pressed={isJoined}
          aria-label={t('joinName', { name: circle.name })}
          className={`h-7.5 flex-none rounded-pill px-3 text-small font-medium disabled:opacity-60 ${
            isJoined ? 'bg-bg/70 text-current' : 'bg-ink text-bg hover:bg-ink-2'
          }`}
        >
          {isJoined ? t('joined') : t('join')}
        </button>
      </div>
    </li>
  )
}
