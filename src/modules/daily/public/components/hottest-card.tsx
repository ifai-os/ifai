import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'

/** 「今日最热」(「IFAI 日报（新版）」board): the hottest story of the last 24 hours, the whole card a link to it. */
export function HottestCard({ story, category }: { story: HotStory; category: string }) {
  const t = useTranslations('daily')
  const card = useTranslations('card')

  return (
    <section
      aria-labelledby="hottest-title"
      className="relative flex min-w-0 flex-col justify-end gap-3.5 overflow-hidden rounded-hero bg-night p-6 text-white md:min-h-80 md:grow-2 md:basis-100 md:p-8"
    >
      <p className="self-start rounded-pill bg-white/14 px-2.5 py-1 text-small">
        {t('hottest')} · {category} · {card('moreSources', { count: story.moreReports })}
      </p>
      <h2 id="hottest-title" lang={story.title.lang} className="text-h2 md:text-h1">
        <Link href={storyHref(story.slug)} className="text-white after:absolute after:inset-0 hover:underline">
          {story.title.value}
        </Link>
      </h2>
      {story.summary && (
        <p lang={story.summary.lang} className="line-clamp-3 text-meta text-white/80 md:text-ui">
          {story.summary.value}
        </p>
      )}
    </section>
  )
}
