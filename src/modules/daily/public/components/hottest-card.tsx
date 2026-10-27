import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'

/**
 * 「头条」(「IFAI 日报（新版）」board): the hottest story of the last 24 hours (else the hottest or
 * the newest there is, see ../data.ts `hottestStory`), the whole card a link to it. Its picture
 * (or video cover) is the backdrop, else its category's (public/daily/hottest/), under a dark
 * scrim that keeps the white text readable.
 */
export function HottestCard({ story, category }: { story: HotStory; category: string }) {
  const t = useTranslations('daily')
  const card = useTranslations('card')

  return (
    <section
      aria-labelledby="hottest-title"
      className="relative isolate flex min-w-0 flex-col justify-end gap-3.5 overflow-hidden rounded-hero bg-night p-6 text-white md:min-h-90 md:grow-2 md:basis-100 md:p-8"
    >
      <Image
        src={story.media?.picture?.url ?? `/daily/hottest/${story.category}.webp`}
        alt=""
        fill
        sizes="(min-width: 768px) 66vw, 100vw"
        className="-z-10 object-cover"
      />
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/55 to-black/25" />
      <p className="self-start rounded-pill bg-white/14 px-2.5 py-1 text-small backdrop-blur-sm">
        {t('hottest')} · {category} · {card('moreSources', { count: story.moreReports })}
      </p>
      <h2 id="hottest-title" lang={story.title.lang} className="text-h2 md:text-display-phone md:leading-9.75">
        <Link href={storyHref(story.slug)} className="text-white after:absolute after:inset-0 hover:underline">
          {story.title.value}
        </Link>
      </h2>
      {story.summary && (
        <p lang={story.summary.lang} className="line-clamp-3 text-meta leading-5.5 text-white/80">
          {story.summary.value}
        </p>
      )}
    </section>
  )
}
