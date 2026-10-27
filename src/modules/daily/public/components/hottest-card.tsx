import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'

/**
 * 「头条」(「IFAI 日报（新版）」board): the hottest story of the last 24 hours (else the hottest or
 * the newest there is, see ../data.ts `hottestStory`), the whole card a link to it. Its picture
 * (or video cover) is the backdrop, else its category's (public/daily/hottest/). Only the lower
 * part, where the text sits, is darkened; the rest of the picture stays clear. Title only, no
 * summary (站长, 2026-10-27).
 */
export function HottestCard({ story, category }: { story: HotStory; category: string }) {
  const t = useTranslations('daily')
  const card = useTranslations('card')

  return (
    <section
      aria-labelledby="hottest-title"
      className="relative isolate flex min-w-0 flex-col justify-end gap-3.5 overflow-hidden rounded-hero bg-night p-6 text-white min-h-60 md:min-h-80 md:grow-2 md:basis-100 md:p-8"
    >
      <Image
        src={story.media?.picture?.url ?? `/daily/hottest/${story.category}.webp`}
        alt=""
        fill
        sizes="(min-width: 768px) 66vw, 100vw"
        className="-z-10 object-cover"
      />
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-linear-to-t md:h-3/5 from-black/80 via-black/45 to-black/0" />
      <p className="self-start rounded-pill bg-white/14 px-2.5 py-1 text-small backdrop-blur-sm">
        {t('hottest')} · {category} · {card('moreSources', { count: story.moreReports })}
      </p>
      <h2 id="hottest-title" lang={story.title.lang} className="text-h2 md:text-display-phone md:leading-9.75">
        <Link href={storyHref(story.slug)} className="text-white after:absolute after:inset-0 hover:underline">
          {story.title.value}
        </Link>
      </h2>
    </section>
  )
}
