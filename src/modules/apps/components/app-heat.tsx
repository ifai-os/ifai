import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { AppDetail } from '../data'
import { heatWeights } from '../heat'
import { listHref } from '../list-params'
import { HeatChart } from './heat-chart'
import { HeatDelta } from './heat-delta'
import { HowHeatToggle } from './how-heat'

type Scored = NonNullable<AppDetail['heat']>

/** Heat, its place in the app's category and the daily mentions as a row of figures under the app's header. */
export function HeatStats({ app, heat, showSiteRank }: { app: AppDetail; heat: Scored; showSiteRank: boolean }) {
  const t = useTranslations('apps')
  const format = useFormatter()
  const { latest } = heat

  const tiles = [
    {
      key: 'heat',
      label: t('heat'),
      value: String(latest.heat),
      note: (
        <>
          <HeatDelta change={latest.change7d} /> · {t('last7')}
        </>
      ),
    },
    ...(app.category && latest.rankCategory
      ? [
          {
            key: 'category',
            label: t('categoryList', { category: app.category.name }),
            value: `#${latest.rankCategory}`,
            note: `${t('placeTop')} #${latest.rankOverall}`,
          },
        ]
      : []),
    ...(showSiteRank && latest.trancoRank
      ? [{ key: 'site', label: t('weights.rank'), value: `#${format.number(latest.trancoRank)}`, note: 'Tranco' }]
      : []),
    { key: 'mentions', label: t('weights.mentions'), value: String(latest.mentions), note: t('last30') },
  ]

  return (
    <dl className={`grid gap-2 md:gap-3 ${tiles.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className="flex min-w-0 flex-col gap-0.5 rounded-card border border-surface-2 bg-surface px-3.5 py-3 md:gap-1.5 md:px-4.5 md:py-4"
        >
          <dt className="truncate text-small text-ink-4">{tile.label}</dt>
          <dd className="text-h3 font-semibold md:text-h2">{tile.value}</dd>
          <dd className="truncate text-small text-ink-4">{tile.note}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The app's heat section (docs/specs/apps.md「页面与路由」): the line over 7 / 30 / 90 days, the
 * three parts that add up to it with what each came from, and its places on the lists.
 */
export function HeatSection({ app, heat, showSiteRank }: { app: AppDetail; heat: Scored; showSiteRank: boolean }) {
  const t = useTranslations('apps')
  const { latest } = heat

  const rankNote =
    latest.trancoRank === null
      ? t('partNotes.unranked')
      : showSiteRank
        ? t('partNotes.rank', { rank: latest.trancoRank })
        : t('partNotes.rankHidden')
  const parts = [
    { key: 'rank', score: latest.rankScore, max: heatWeights.rank, note: rankNote },
    {
      key: 'engagement',
      score: latest.engagementScore,
      max: heatWeights.engagement,
      note: t('partNotes.engagement', { clicks: latest.clicks, saves: latest.saves }),
    },
    { key: 'mentions', score: latest.mentionScore, max: heatWeights.mentions, note: t('partNotes.mentions', { count: latest.mentions }) },
  ] as const

  const places = [
    { key: 'top', label: t('placeTop'), place: latest.rankOverall, href: listHref({}) },
    ...(app.category && latest.rankCategory
      ? [{ key: 'category', label: t('categoryList', { category: app.category.name }), place: latest.rankCategory, href: listHref({ category: app.category.slug }) }]
      : []),
    { key: 'rising', label: t('placeRising'), place: latest.rankRising, href: listHref({ board: 'rising' }) },
  ]

  return (
    <section aria-labelledby="heat" className="flex scroll-mt-20 flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="heat" className="text-h3 font-semibold md:text-h2">
          {t('heat')}
        </h2>
        <span className="text-small text-ink-4">{t('heatOutOf')}</span>
      </div>

      {heat.history.length >= 2 && <HeatChart history={heat.history} />}

      <div className="flex flex-wrap gap-x-8 gap-y-7">
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <h3 className="text-title">{t('parts')}</h3>
          <ul className="flex flex-col gap-4">
            {parts.map((part) => (
              <li key={part.key} className="flex flex-col gap-1.5">
                <span className="flex justify-between gap-3 text-meta">
                  <span>
                    {t(`weights.${part.key}`)} <span className="text-ink-4">· {t('weight', { value: part.max })}</span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {part.score} / {part.max}
                  </span>
                </span>
                <span aria-hidden="true" className="h-2 overflow-hidden rounded-tag bg-surface-2">
                  <span className="block h-full bg-ink" style={{ width: `${(part.score / part.max) * 100}%` }} />
                </span>
                <span className="text-small text-ink-4">{part.note}</span>
              </li>
            ))}
          </ul>
          <p className="text-small text-ink-4">{t('partsSum')}</p>
          <HowHeatToggle />
        </div>

        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-3.5 self-start rounded-hero border border-surface-2 bg-surface p-5">
          <h3 className="text-ui font-medium">{t('places')}</h3>
          <ul className="flex flex-col gap-3">
            {places.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-baseline justify-between gap-3 hover:text-accent">
                  <span className="min-w-0 truncate text-meta text-ink-2">{item.label}</span>
                  {item.place ? (
                    <span className="text-h3 font-semibold text-accent">#{item.place}</span>
                  ) : (
                    <span className="text-meta text-ink-4">{t('notOnList')}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
