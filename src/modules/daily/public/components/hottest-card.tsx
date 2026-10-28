import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'
import { SpreadIndex } from './spread-index'

/**
 * 「头条」(「IFAI 日报（新版）」board): the hottest story of the last 24 hours (else the hottest or
 * the newest there is, see ../data.ts `hottestStory`), the whole card a link to it. Its picture
 * (or video cover) is the backdrop, else its category's (public/news/hottest/). Only the title's
 * strip is darkened; the frosted label above needs none, and the rest of the picture stays clear.
 * Title only, no summary; hovering zooms the picture a little instead of underlining (站长, 2026-10-27).
 */
export function HottestCard({ story, category }: { story: HotStory; category: string }) {
  const t = useTranslations('daily')

  return (
    <section
      aria-labelledby="hottest-title"
      className="group relative isolate flex min-w-0 flex-col justify-end gap-2 overflow-hidden rounded-hero bg-night p-6 text-white min-h-60 md:min-h-80 md:grow-2 md:basis-100 md:p-8"
    >
      <Image
        src={story.media?.picture?.url ?? `/news/hottest/${story.category}.webp`}
        alt=""
        fill
        sizes="(min-width: 768px) 66vw, 100vw"
        className="-z-10 object-cover transition-transform duration-500 group-hover:scale-103 motion-reduce:transition-none"
      />
      {/* One flex row so the words and the bolt share a centre line (站长, 2026-10-28). */}
      <p className="flex items-center gap-1 self-start rounded-pill bg-black/35 px-2.5 py-1 text-small backdrop-blur-md">
        <span>
          {t('hottest')} · {category}
          {story.spread > 0 && ' ·'}
        </span>
        {story.spread > 0 && <SpreadIndex value={story.spread} plain />}
      </p>
      {/* The strip reaches the card's edges and fades out just above the title, under the label. */}
      <div className="-mx-6 -mb-6 bg-linear-to-t from-black/65 from-45% to-black/0 px-6 pt-3 pb-6 md:-mx-8 md:-mb-8 md:px-8 md:pt-4 md:pb-8">
        <h2 id="hottest-title" lang={story.title.lang} className="text-h2 md:text-display-phone md:leading-9.75">
          <Link href={storyHref(story.slug)} className="text-white after:absolute after:inset-0">
            {story.title.value}
          </Link>
        </h2>
      </div>
    </section>
  )
}
