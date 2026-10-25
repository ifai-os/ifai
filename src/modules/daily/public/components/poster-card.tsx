import { useTranslations } from 'next-intl'

import { Logo } from '@/components/brand/logo'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'

import type { PosterSummary } from '../data'
import { posterDay, posterHref, posterImagePath } from '../list-params'

/**
 * 「每日 AI 大事」(「IFAI 日报（新版）」board): the newest generated poster and a sketch of it. The
 * card links to the poster's page; 「下载海报」 saves the image in the reader's language.
 */
export function PosterCard({ poster, locale }: { poster: PosterSummary; locale: Locale }) {
  const t = useTranslations('poster')

  return (
    <div className="relative flex flex-col gap-3 rounded-hero border border-surface-2 bg-surface p-5 transition-colors hover:border-line">
      <span className="flex flex-col gap-0.5">
        <Link href={posterHref(poster.date)} className="text-body font-medium text-ink after:absolute after:inset-0">
          {t('title')}
        </Link>
        <span className="text-small text-ink-4">{posterDay(poster.date, locale, false)}</span>
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
        <a
          href={posterImagePath(locale, poster.date, poster.version)}
          download={`ifai-${poster.date}-${locale}.png`}
          className="relative flex min-h-8 items-center font-medium text-link hover:underline"
        >
          {t('save')} <span aria-hidden="true">›</span>
        </a>
      </span>
    </div>
  )
}
