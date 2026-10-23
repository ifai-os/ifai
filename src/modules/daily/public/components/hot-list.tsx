import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { HeatTrend } from '../../story-fields'
import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'

const badges: Record<HeatTrend, string> = {
  rising: 'bg-success-soft text-success-ink',
  new: 'bg-accent-soft text-tile-7-ink',
}

/** 「48 小时热门」(「IFAI 日报（新版）」board): one story per event, hottest first, marked when rising or new. */
export function HotList({ stories }: { stories: HotStory[] }) {
  const t = useTranslations('daily')

  return (
    <section aria-labelledby="hot-title" className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 id="hot-title" className="text-title">
          {t('hotTitle')}
        </h2>
        <span className="text-small text-ink-4">{t('hotBy')}</span>
      </div>
      <ol>
        {stories.map((story, index) => (
          <li key={story.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-2 border-b border-hairline py-3">
            <span aria-hidden="true" className={`text-meta font-semibold tabular-nums ${index < 3 ? 'text-accent' : 'text-ink-4'}`}>
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <Link
                href={storyHref(story.slug)}
                lang={story.title.lang}
                className="line-clamp-2 text-meta text-ink after:absolute after:inset-0 hover:text-accent"
              >
                {story.title.value}
              </Link>
              <span className="flex flex-wrap items-center gap-1.5 text-small text-ink-4">
                {t('outlets', { count: story.outlets })}
                {story.trend && <span className={`rounded-tag px-1.5 font-medium ${badges[story.trend]}`}>{t(`trend.${story.trend}`)}</span>}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
