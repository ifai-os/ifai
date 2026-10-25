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
 * three parts that add up to it with what each came from, and the Daily stories that mention the
 * app. Phones also have its places on the lists here; wider screens have them beside the tabs.
 */
export function HeatSection({ app, showSiteRank }: { app: AppDetail; showSiteRank: boolean }) {
  const t = useTranslations('apps')
  const { heat } = app

  return (
    <section aria-labelledby="heat" className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="heat" className="scroll-mt-20 text-h3 font-semibold md:text-title md:font-medium">
          {t('heat')}
        </h2>
        {heat && <span className="text-small text-ink-4">{t('heatOutOf')}</span>}
      </div>

      {heat && heat.history.length >= 2 && <HeatChart history={heat.history} />}

      <div className="flex flex-wrap gap-x-8 gap-y-7">
        {heat && <HeatParts heat={heat} showSiteRank={showSiteRank} />}
        {heat && <HeatPlaces app={app} heat={heat} level={3} className="flex-[1_1_220px] self-start md:hidden" />}
        {app.mentions.length > 0 && <Mentions app={app} />}
      </div>
    </section>
  )
}

/** The three scores that add up to the heat, each with what it came from. */
function HeatParts({ heat, showSiteRank }: { heat: Scored; showSiteRank: boolean }) {
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

  return (
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
  )
}

type HeatPlacesProps = {
  app: AppDetail
  heat: Scored
  /** h3 inside the heat section on phones, h2 beside the tabs. */
  level: 2 | 3
  id?: string
  className?: string
}

/** Where the app is on the overall, category and rising lists, each linking to its list. */
export function HeatPlaces({ app, heat, level, id, className = '' }: HeatPlacesProps) {
  const t = useTranslations('apps')
  const { latest } = heat
  const Heading = level === 2 ? 'h2' : 'h3'

  const places = [
    { key: 'top', label: t('placeTop'), place: latest.rankOverall, href: listHref({}) },
    ...(app.category && latest.rankCategory
      ? [{ key: 'category', label: t('categoryList', { category: app.category.name }), place: latest.rankCategory, href: listHref({ category: app.category.slug }) }]
      : []),
    { key: 'rising', label: t('placeRising'), place: latest.rankRising, href: listHref({ board: 'rising' }) },
  ]

  return (
    <div className={`flex min-w-0 flex-col gap-3.5 rounded-hero border border-surface-2 bg-surface p-5 ${className}`}>
      <Heading id={id} className="text-ui font-medium">
        {t('places')}
      </Heading>
      <ul className="flex flex-col gap-3">
        {places.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex items-baseline justify-between gap-3 hover:text-accent-ink">
              <span className="min-w-0 truncate text-meta text-ink-2">{item.label}</span>
              {item.place ? (
                <span className="text-h3 font-semibold text-accent-ink">#{item.place}</span>
              ) : (
                <span className="text-meta text-ink-4">{t('notOnList')}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 日报里提到它: the latest Daily stories about the app, and how many there were in 30 days. */
function Mentions({ app }: { app: AppDetail }) {
  const t = useTranslations('apps')
  const nav = useTranslations('nav')
  const categories = useTranslations('categories')
  const format = useFormatter()

  return (
    <section aria-labelledby="mentions" className="flex min-w-0 flex-[1_1_280px] flex-col gap-3 md:gap-1.5">
      <h3 id="mentions" className="scroll-mt-20 text-h3 font-semibold md:text-title md:font-medium">
        {t('mentionsTitle')}
      </h3>
      <div className="flex flex-col">
        <ul className="flex flex-col border-t border-surface-2">
          {app.mentions.map((mention) => (
            <li key={mention.slug} className="border-b border-surface-2">
              <Link href={`/daily/${mention.slug}`} className="group flex flex-col gap-1 py-3">
                <span lang={mention.title.lang} className="text-body font-medium group-hover:text-accent-ink">
                  {mention.title.value}
                </span>
                <span className="text-small text-ink-4">
                  {format.dateTime(new Date(mention.publishedAt), { month: 'long', day: 'numeric' })} · {nav('daily')}
                  {mention.category && ` · ${categories(mention.category)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {app.heat && app.heat.latest.mentions > 0 && (
          <p className="pt-2.5 text-meta text-ink-4">{t('mentionsCount', { count: app.heat.latest.mentions })}</p>
        )}
      </div>
    </section>
  )
}
