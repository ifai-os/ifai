'use client'

import { useTranslations } from 'next-intl'

import { tileTones } from '@/components/cards/initial-tile'
import { Link } from '@/i18n/navigation'

import { useCircles } from './circles-provider'

/** Beside the feed (below it on phones): the reader's circles and the circle guidelines. 「值得关注的人」comes with following members. */
export function CirclesSidebar() {
  const t = useTranslations('circles')
  const { byId, joined, overview, signedIn } = useCircles()
  const mine = joined.flatMap((id) => {
    const circle = byId.get(id)
    return circle ? [circle] : []
  })
  const today = new Map(overview.circles.map((item) => [item.id, item.today]))

  return (
    <aside className="flex w-full min-w-0 flex-[1_1_260px] flex-col gap-4 md:max-w-side">
      <section aria-labelledby="my-circles" className="flex flex-col gap-1 rounded-hero border border-surface-2 bg-surface p-5">
        <div className="flex items-baseline justify-between pb-1.5">
          <h2 id="my-circles" className="text-title font-medium">
            {t('myCircles')}
          </h2>
          {mine.length > 0 && <span className="text-small text-ink-4">{t('myCount', { count: mine.length })}</span>}
        </div>
        {mine.length > 0 ? (
          <ul className="flex flex-col">
            {mine.map((circle) => {
              const count = today.get(circle.id) ?? 0
              return (
                <li key={circle.id}>
                  <Link
                    href={{ pathname: '/circles', query: { circle: circle.slug } }}
                    scroll={false}
                    className="flex min-h-11 items-center gap-2.5 py-1 text-meta hover:underline"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-7 flex-none items-center justify-center rounded-thumb text-meta font-bold ${tileTones[circle.tone % tileTones.length]}`}
                    >
                      #
                    </span>
                    <span className="min-w-0 flex-1 wrap-anywhere">{circle.name}</span>
                    {count > 0 && <span className="flex-none text-small text-ink-4">{t('newToday', { count })}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-2 text-meta text-ink-4">{signedIn ? t('noCircles') : t('noCirclesVisitor')}</p>
        )}
      </section>

      <section aria-labelledby="circle-rules" className="flex flex-col gap-2 px-1">
        <h2 id="circle-rules" className="text-title font-medium">
          {t('rulesTitle')}
        </h2>
        <p className="text-meta text-ink-3">{t('rules')}</p>
      </section>
    </aside>
  )
}
