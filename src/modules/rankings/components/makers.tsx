import { useTranslations } from 'next-intl'

import { LABS_AMONG, topMakers } from '../rules'

/** 「按厂商」: how many of each maker's models are in the first 30 places. */
export function Makers({ rows }: { rows: { rank: number | null; org: string }[] }) {
  const t = useTranslations('rankings')
  const makers = topMakers(rows)
  if (makers.length === 0) return null
  const most = makers[0].models

  return (
    <section
      aria-labelledby="rankings-makers"
      className="flex min-w-0 flex-[2_1_300px] flex-col gap-2.5 self-start rounded-hero border border-surface-2 bg-surface px-5.5 py-5"
    >
      <h2 id="rankings-makers" className="text-body font-medium">
        {t('makers')}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {makers.map((maker) => (
          <li key={maker.org} className="grid grid-cols-[minmax(0,84px)_minmax(0,1fr)_auto] items-center gap-2.5 text-meta">
            <span className="truncate" title={maker.org}>
              {maker.org}
            </span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-tag bg-line">
              <span className="block h-2 bg-ink" style={{ width: `${(maker.models / most) * 100}%` }} />
            </span>
            <span className="text-right text-ink-4 tabular-nums">{t('makerModels', { count: maker.models })}</span>
          </li>
        ))}
      </ul>
      <p className="text-small text-ink-4">{t('makersNote', { places: LABS_AMONG })}</p>
    </section>
  )
}
