import { useTranslations } from 'next-intl'

import { Logo } from '@/components/brand/logo'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'

import type { PosterSummary } from '../data'
import { posterDay, posterHref } from '../list-params'

/** 「每日 AI 大事」(「IFAI 日报（新版）」board): the newest generated poster, a sketch of it, the whole card a link to its page. */
export function PosterCard({ poster, locale }: { poster: PosterSummary; locale: Locale }) {
  const t = useTranslations('poster')

  return (
    <Link href={posterHref(poster.date)} className="flex flex-col gap-3 rounded-hero border border-surface-2 bg-surface p-5 transition-colors hover:border-line">
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-medium">{t('title')}</span>
        <span className="text-small text-ink-4">{t('dateLine', { date: posterDay(poster.date, locale, false) })}</span>
      </span>
      <span aria-hidden="true" className="flex h-23 flex-col justify-between rounded-tile bg-night px-3.5 py-3">
        <span className="flex items-center gap-1.5">
          <Logo size={14} tone="dark" />
          <span className="text-micro tracking-wide text-white/80">{t('brand')}</span>
        </span>
        <span className="flex flex-col gap-1.25">
          <span className="h-1.5 w-5/6 rounded-pill bg-white/85" />
          <span className="h-1.5 w-2/3 rounded-pill bg-white/40" />
          <span className="h-1.5 w-3/4 rounded-pill bg-white/40" />
        </span>
      </span>
      <span className="flex items-center justify-between gap-2 text-meta">
        <span className="text-ink-2">{t('count', { count: poster.count })}</span>
        <span className="font-medium text-link">
          {t('view')} <span aria-hidden="true">›</span>
        </span>
      </span>
    </Link>
  )
}
