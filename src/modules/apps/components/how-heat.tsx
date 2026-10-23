import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import { Link } from '@/i18n/navigation'

import { heatWeights } from '../heat'
import { submitHref } from '../list-params'

const parts = ['rank', 'engagement', 'mentions'] as const

/** What heat is made of: a short explanation and the three weights as bars. */
function HowHeatBody() {
  const t = useTranslations('apps')

  return (
    <>
      <p className="text-meta text-ink-2">{t('howBody')}</p>
      <ul className="flex flex-col gap-2">
        {parts.map((part) => (
          <li key={part} className="grid grid-cols-[112px_minmax(0,1fr)_40px] items-center gap-2.5 text-small text-ink-2">
            <span>{t(`weights.${part}`)}</span>
            <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-line">
              <span className="block h-full bg-ink" style={{ width: `${heatWeights[part]}%` }} />
            </span>
            <span className="text-right tabular-nums">{heatWeights[part]}%</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** 「热度怎么算」beside the list on wider screens, with the way to submit an app at its foot. */
export function HowHeatCard() {
  const t = useTranslations('apps')

  return (
    <section
      aria-labelledby="how-heat"
      className="hidden min-w-0 flex-[1_1_320px] flex-col gap-2.5 rounded-hero border border-surface-2 bg-surface px-6 py-5.5 md:flex"
    >
      <h2 id="how-heat" className="text-title">
        {t('howTitle')}
      </h2>
      <HowHeatBody />
      <Link href={submitHref()} className="flex min-h-8 items-center self-start text-meta text-link hover:underline">
        {t('submitLink')} ›
      </Link>
    </section>
  )
}

/** 「热度怎么算」as a toggle: above the list on phones, and under an app's heat. */
export function HowHeatToggle({ className = '' }: { className?: string }) {
  const t = useTranslations('apps')

  return (
    <details className={`group ${className}`}>
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 self-start text-meta text-link [&::-webkit-details-marker]:hidden">
        <Icon name="info" size={15} />
        {t('howTitle')}
      </summary>
      <div className="mt-2 flex flex-col gap-2.5 rounded-tile bg-surface px-4 py-3.5">
        <HowHeatBody />
      </div>
    </details>
  )
}
