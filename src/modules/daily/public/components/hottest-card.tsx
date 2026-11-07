import { MediaPicture } from '@/components/media-picture'
import { Link } from '@/i18n/navigation'

import type { HotStory } from '../story-item'
import { storyHref } from '../list-params'

/**
 * 「头条」(「IFAI 日报（新版）」board): the hottest story of the last 24 hours (else the hottest or
 * the newest there is, see ../data.ts `hottestStory`), the whole card a link to it. Its picture
 * (or video cover) is the backdrop, else its category's (public/news/hottest/). Title only: no
 * summary (站长, 2026-10-27) and no label line above it (站长, 2026-11-07). As on sspai.com, the
 * strip under the title blurs and darkens the picture, fading in at its top, so the title reads on
 * any picture and the rest stays clear. Hovering zooms the picture a little instead of underlining.
 */
export function HottestCard({ story }: { story: HotStory }) {
  return (
    <section
      aria-labelledby="hottest-title"
      className="group relative isolate flex min-w-0 flex-col justify-end overflow-hidden rounded-hero bg-night text-white min-h-60 md:min-h-80 md:grow-2 md:basis-100"
    >
      <MediaPicture
        picture={story.media?.picture ?? { url: `/news/hottest/${story.category}.webp` }}
        alt=""
        sizes="(min-width: 768px) 66vw, 100vw"
        className="-z-10 object-cover transition-transform duration-500 group-hover:scale-103 motion-reduce:transition-none"
      />
      {/* sspai.com's recipe: the title's strip blurs the picture (20px) and darkens it to 50% at the bottom (sspai: 40%; ours is a touch darker for light pictures), its
          top 30% fading in. The strip and the title share one grid cell, so nothing between the title's link
          and the section is positioned and the link still covers the whole card. */}
      <div className="grid">
        <div
          aria-hidden="true"
          className="-z-5 col-start-1 row-start-1 bg-linear-to-b from-black/0 to-black/50 backdrop-blur-[20px] mask-t-from-70%"
        />
        <h2
          id="hottest-title"
          lang={story.title.lang}
          className="col-start-1 row-start-1 line-clamp-2 px-6 pt-12 pb-6 text-h2 md:px-8 md:pt-14 md:pb-8 md:text-display-phone md:leading-9.75"
        >
          <Link href={storyHref(story.slug)} className="text-white after:absolute after:inset-0">
            {story.title.value}
          </Link>
        </h2>
      </div>
    </section>
  )
}
